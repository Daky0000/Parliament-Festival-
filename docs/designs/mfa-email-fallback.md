# Design: email code as a fallback for two-step verification

Status: **Approved (r2), implemented** · Builds on `phase-1-security.md` (TOTP MFA, B2)
Review: r1 reviewed by a zero-context security reviewer; findings and resolutions in §10.

## 1. Problem

Privileged staff must enter a TOTP code from an authenticator app after their
password. If the phone is lost, reset or out of reach, the only way back in is
a super admin running "Reset 2-step" (or `scripts/reset-mfa.ts` on the server).
The only super admin has no one to ask.

Goal: on the verification step, a user who already has an authenticator set up
can choose "Email me a code instead", receive a 6-digit code at their account
email, and finish signing in with it.

## 2. Non-goals

- Replacing TOTP. Enrolment still requires an authenticator app. The email
  code is only offered to users with `mfaEnabledAt` set (`mode=verify`).
- SMS codes, backup codes, passkeys. Possible later; not in this change.
- Changing the authenticator. Using an email code does not reset or re-enrol
  TOTP. To change phones, the user still uses "Reset 2-step".
- Non-local accounts. Email codes are offered only when `authProvider === "local"`,
  matching `/api/auth/forgot`.

## 3. The main risk, and the mitigation

Password reset is already done by email. If email can also stand in for the
second factor, **control of the mailbox alone would be enough to take over an
account**: reset the password, then ask for an email code. Every warning email
goes to the same mailbox, so the attacker can delete them. A time-based
cooldown only delays this.

**Rule (M1): the email code works only if the user's most recent successful
authenticator sign-in is later than their most recent password change.**

- New column `users.mfa_totp_verified_at`, set on every successful TOTP verify
  (enrolment included).
- Email codes allowed iff `mfaTotpVerifiedAt != null` and
  (`passwordChangedAt == null` or `mfaTotpVerifiedAt > passwordChangedAt`).
- `passwordChangedAt` is written by: activation (`activate/route.ts`), reset link
  (`reset/route.ts`), signed-in change (`password/route.ts`) and
  `scripts/set-password.ts`. All four close the email fallback until the next
  authenticator sign-in. Activation always precedes enrolment, so a new user
  is unaffected.
- Backfill: `mfa_totp_verified_at = mfa_enabled_at` for enrolled users.

Consequence the owner accepts: **if you lose your phone and also reset your
password, email codes will not let you in.** Recovery is then a super admin's
"Reset 2-step" or `scripts/reset-mfa.ts`. Without a password reset, someone
with only your mailbox cannot sign in (they lack the password), and someone
with only your password cannot sign in (they lack the mailbox).

Supporting measures:

- **M2. Bound to the session that proved the password.** The code is stored on
  the pending session row. A code emailed to one sign-in cannot finish another.
- **M3. Notification.** After a successful email-code sign-in, a second email
  says "You signed in with an email code instead of your authenticator", with
  the time and the browser (user agent, truncated). Raw IPs are not stored, so
  none is shown. Sending failure is logged, not fatal.
- **M4. Audit.** Every send, refusal, failure and success is logged.

## 4. Behaviour

### 4.1 Sending

`POST /api/auth/mfa/email` (requires an `mfaPending` session, origin-checked).

1. `requirePendingSession`, then re-read the session row
   (`where: {id, revokedAt: null, mfaPending: true}`) and the user.
2. 409 if the user has no `mfaEnabledAt` or is not `local`.
3. 403 `"Email codes are unavailable until you next sign in with your
   authenticator app (your password was changed). Ask a super admin to reset
   two-step verification."` if M1 fails. Audit `auth.mfa_email_refused`.
   (Accepted: this tells a password holder that the password was changed.)
4. Throttle: `assertNotThrottled(attemptKey("mfa_email_send", user.id), "mfa_email_send")`
   with `LIMITS.mfa_email_send = 3`, then
   `recordAttempt(sameKey, "mfa_email_send", false)` **before** sending (a
   counted row; `failuresSince` counts only `succeeded:false`).
5. Generate a 6-digit code (`crypto.getRandomValues`, rejection sampling for
   uniformity). Claim the resend slot atomically:
   `session.updateMany({ where: {id, revokedAt: null, mfaPending: true,
   OR: [{emailCodeSentAt: null}, {emailCodeSentAt: {lt: now - 60s}}]},
   data: {emailCodeHash, emailCodeExpiresAt: now + 10 min, emailCodeSentAt: now} })`.
   `count === 0` → 409 `"Wait a minute before asking for another code."`
   `emailCodeHash = keyedHash("mfa_email:" + sessionId + ":" + code)`.
   A new send replaces the previous code.
6. Send through Resend (`getProviderSecret("resend")`, `resolveSenderAddress`),
   `idempotencyKey: "mfa_email_" + sessionId + "_" + sentAt.getTime()` (never
   the code), tag `type: mfa_email_code`.
   - Provider `mock` in a deployed environment (`isDeployed()`): 502, no send.
   - Provider `mock` locally: log the code to the server console.
   - Send failure: clear the three columns, audit `auth.mfa_email_send_failed`,
     502 `"We couldn't send the email. Use your authenticator app or try again."`
7. Response `{ ok: true, sentTo: "d•••@gmail.com", expiresInSeconds: 600 }`
   (first character of the local part, then `•••`, then `@` and the full domain).

Email: subject "Your sign-in code", the code in large type, "valid for 10
minutes and only on the sign-in page where you asked for it", and "If this
wasn't you, someone knows your password: change it." Same style as the
password reset email.

### 4.2 Verifying

`POST /api/auth/mfa/verify` gains optional `method: "totp" | "email"`
(default `"totp"`; existing clients unchanged).

For `method: "email"`:

1. Same `mfa` throttle as TOTP. Wrong email codes and wrong TOTP codes share
   the counter: 5 failures in 15 min revoke the pending session.
2. Re-check M1 (403 as in §4.1.3).
3. Consume atomically:
   `session.updateMany({ where: {id, revokedAt: null, mfaPending: true,
   emailCodeHash: keyedHash(...submitted code...), emailCodeExpiresAt: {gt: now}},
   data: {emailCodeHash: null, emailCodeExpiresAt: null} })`.
   Equality on a keyed hash is not a timing oracle for the code. `count !== 1`
   (no code sent, wrong, expired, or already used) → counted failure,
   audit `auth.mfa_failed` with `details.method = "email"`,
   401 `"Incorrect or expired code"`. No separate 409 for "no code sent".
4. Success: do **not** touch `mfaLastStep` or `mfaTotpVerifiedAt`; rotate to a
   full session as TOTP does, carrying `ipHash` over from the pending session
   (fixes today's drop in `verify/route.ts`, for both methods); audit
   `auth.mfa_email_verified`; send M3.

For `method: "totp"`: unchanged, plus set `mfaTotpVerifiedAt = now` on success.

Brute force: 5 guesses per 15 min per user across all sessions, about 480 a day,
each 10⁻⁶ → about 0.05 % per day for an attacker who already has the password.
Concurrency can push slightly past 5 per window; this race already exists for
TOTP and is accepted.

Accepted denial of service: someone with the password can use up the 3 sends
and the shared `mfa` budget, blocking the real user for 15 minutes.

### 4.3 Page (`/login/mfa`, verify mode only)

Between the Verify button and "Use a different account" (owner's placement):
a link "Choose another 2FA option". It opens a small panel with "Email me a
code — Send a 6-digit code to your account email" and "Cancel". Choosing it
calls the send endpoint; on success the page switches to email mode: "We sent a
6-digit code to d•••@gmail.com. It expires in 10 minutes.", the field label
becomes "Email code", and the links become "Send the code again" (counts down
60 s) and "Use authenticator app instead". Errors (403, 409, 429, 502) are
shown in place. Submit sends `method` accordingly.

Not shown while enrolling (the QR-code screen): the user has no authenticator
yet, so the fallback would replace two-step verification rather than back it up.

## 5. Data model (expand-only migration)

| Table | Column | Type | Purpose |
|---|---|---|---|
| `sessions` | `email_code_hash` | text null | keyed hash of the current code |
| `sessions` | `email_code_expires_at` | timestamptz null | 10 min after sending |
| `sessions` | `email_code_sent_at` | timestamptz null | 60 s resend limit |
| `users` | `mfa_totp_verified_at` | timestamptz null | last successful TOTP verify (M1) |

Backfill `users.mfa_totp_verified_at = mfa_enabled_at` where not null. Older
deployments ignore the columns, so rollback is safe. `scripts/reset-mfa.ts`
and the admin "Reset 2-step" also clear `mfa_totp_verified_at`.

## 6. Audit actions

`auth.mfa_email_sent`, `auth.mfa_email_send_failed`, `auth.mfa_email_refused`,
`auth.mfa_failed` (existing; gains `details.method`), `auth.mfa_email_verified`.
No code or code hash is logged.

## 7. Tests

- Unit: code generator returns 6 digits; address masking.
- Integration (`tests/security/`):
  - send refused before enrolment (409), for non-local accounts (409);
  - M1: after a reset link, email code refused even 25 h later; allowed again
    after one TOTP sign-in; activation then enrolment leaves it allowed;
  - resend within 60 s refused; fourth send in 15 min → 429;
  - correct code signs in, rotates the session, keeps `ipHash`;
    `mfaLastStep` and `mfaTotpVerifiedAt` unchanged;
  - two concurrent verifies with the same code: exactly one succeeds;
  - code from session A rejected on session B; expired and reused codes rejected;
  - `method:"email"` with no code sent is a counted 401;
  - 5 mixed wrong codes (email + TOTP) revoke the pending session;
  - mock provider in a deployed environment → 502; send failure clears the code.

## 8. Acceptance

- A1. A user with an authenticator, whose last authenticator sign-in is after
  their last password change, can sign in with password + email code.
- A2. No email-code path for users without TOTP, for non-local users, or after
  a password change until the next authenticator sign-in.
- A3. All tests in §7 pass; existing TOTP tests unchanged.

## 9. Files

`prisma/schema.prisma` + migration; `src/lib/auth.ts` (limit, M1 helper);
`src/lib/mfa-email.ts` (code, hash, mask); `src/lib/email/mfa-code.ts`
(two emails); `src/app/api/auth/mfa/email/route.ts`;
`src/app/api/auth/mfa/verify/route.ts`; `src/app/login/mfa/page.tsx`;
`src/app/api/v1/admin/users/[userId]/route.ts` and `scripts/reset-mfa.ts`
(clear the new column); tests.

## 10. Review r1 resolutions

| # | Finding | Resolution |
|---|---|---|
| 1 | 24 h cooldown only delays mailbox takeover | Replaced by M1 (TOTP sign-in after last password change) |
| 2 | Double-spend race on verify; resend race | Conditional `updateMany` for consume and for resend slot |
| 3 | Send throttle mismatched `failuresSince` | Exact key, limit and `succeeded:false` row specified |
| 4 | `passwordChangedAt` null / all writers | Null = allowed (if TOTP verified); all four writers listed |
| 5 | Session helper lacks new columns; no-code case | Re-read row with `revokedAt:null`; no-code is a counted 401 |
| 6 | Mock provider, idempotency key | 502 for mock when deployed; key format given |
| 7 | Non-local accounts | Local only |
| 8 | 403 reveals reset; send DoS | Stated as accepted |
| 9 | Brute-force math | Added |
| 10 | Weak reset test | Replaced with the 25 h test |
| 11 | Notification content; `ipHash` dropped on rotation | User agent shown; `ipHash` carried over |
