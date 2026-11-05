# Phase 1: Authentication, Authorization and Secrets

| Field | Value |
|---|---|
| Status | Approved under the owner's standing instruction (2026-11-05). Goldfish review findings are recorded in §12. |
| Depends on | Phase 0 (`docs/designs/phase-0-foundation.md`): Postgres, migrations, CI |
| Source spec | Remediation spec §3.1, §3.2, §5, §19.1 |

## 1. Problem

The audit on 2026-11-05 found the following:

- `getCurrentUser()` in `src/lib/auth.ts` returns the seeded admin when no cookie is present.
- The cookie value is a bare user UUID: it has no signature, no expiry and no revocation.
- No login or logout route exists.
- `hasPermission()` is never called.
- Every `/api/v1` route is effectively anonymous, including secret rotation, test sends and exports.
- Revoked role assignments still grant permissions.
- Secrets are written to `.env` at runtime.
- The R2 secret is returned by `GET /super-admin/overview`.

## 2. Goals

- **G1:** No request is authenticated without a valid, unexpired, unrevoked server-side session.
- **G2:** Every protected route denies access by default. Each route authorizes a named permission against a specific event, so changing an ID cannot cross organizations or events.
- **G3:** Staff can sign in, sign out and activate an invited account. Privileged accounts use TOTP MFA.
- **G4:** Secrets are never written to disk, never returned after being saved, and are encrypted at rest when they are configured from the UI.
- **G5:** Tests prove G1 and G2 for every route.

## 3. Non-goals

- Phase 2: transactions, data constraints, the token lifecycle, and audit coverage of business actions.
- Phase 3: sending emails. Invite links are shown to the admin, who shares them; the email channel arrives in Phase 3.
- Phase 4: gates and the check-in supervisor role.

## 4. Sessions

### 4.1 Model

```prisma
model Session {
  id           String    @id            // sha256(rawToken), hex
  userId       String
  createdAt    DateTime  @default(now())
  lastSeenAt   DateTime  @default(now())
  expiresAt    DateTime                 // absolute: createdAt + 12h
  revokedAt    DateTime?
  mfaPending   Boolean   @default(false)
  userAgent    String?                  // first 200 chars
  ipHash       String?                  // sha256(ip + APP_ENCRYPTION_KEY)
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("sessions")
}
```

### 4.2 Token and cookie

- The raw token is 32 random bytes, encoded base64url, created with `generateSecureToken()` in `src/lib/tokens.ts`. The database stores only its SHA-256 hash.
- The cookie is named `__Host-pf_session` when `APP_ENV` is not `local`, and `pf_session` locally, because `__Host-` requires Secure.
- Cookie attributes: `HttpOnly; Secure` (except local); `SameSite=Lax; Path=/`. There is no `Max-Age`, so it is a browser-session cookie; the server enforces expiry.

### 4.3 Validity

A session is valid only when all of these hold:

- `revokedAt` is null;
- `now < expiresAt`;
- `now − lastSeenAt < 2h` (idle timeout);
- the user's status is `active`.

`lastSeenAt` is updated at most once every 5 minutes, to limit database writes.

### 4.4 Rotation and revocation

| Event | Effect |
|---|---|
| Login | A new session is created. Any session token the browser presented before is revoked. |
| Logout | The current session is revoked. |
| Password change | All of the user's sessions are revoked, except the current one, which is rotated. |
| Account suspend or deactivate | All of the user's sessions are revoked. |
| Role grant or revoke | All of the target user's sessions are revoked, which forces a re-login. |
| Admin action "Sign out everywhere" | All of the target user's sessions are revoked. |

### 4.5 Password hashing

- Passwords are hashed with bcryptjs at cost 10, which is the existing format.
- **Workers Paid** allows enough CPU per request for this; this assumption is verified by the CI Worker build and the staging smoke test.
- Passwords must be at least 12 characters and must not equal the email address.

## 5. Login, MFA, activation

### 5.1 Endpoints

All endpoints are `POST` and take JSON bodies.

| Endpoint | Purpose |
|---|---|
| `/api/auth/login` | Body `{email, password}`. Returns 200 with `{mfa: "none" \| "verify" \| "enroll"}`, or 401 `{error: "Invalid email or password"}`. The 401 response is identical whether the email is unknown or the password is wrong. |
| `/api/auth/logout` | Revokes the current session and clears the cookie. |
| `/api/auth/mfa/enroll` | Requires a `mfaPending` session. Returns `{otpauthUrl, qrDataUrl}` and stores the encrypted secret as pending. |
| `/api/auth/mfa/verify` | Body `{code}`. Checks TOTP with a ±1 step window. On success: sets `mfaEnabledAt` on first enrolment, sets `mfaPending=false`, and rotates the session. |
| `/api/auth/activate` | Body `{token, password}`. Uses a single-use invite (§5.3), sets the password and status `active`, then logs the user in. |
| `/api/auth/password` | Body `{currentPassword, newPassword}`. Changes the password. |

### 5.2 Login lockout

Failed login attempts are recorded in `audit_logs`:

```
action  = auth.login_failed
details = {emailHash, ipHash}
```

If the same `emailHash` or `ipHash` has 5 or more failures in the last 15 minutes, the login endpoint returns `429`, with the same response body whether or not the account exists.

### 5.3 Staff invites

```prisma
model UserInvite {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime            // 72h
  usedAt    DateTime?
  createdBy String
  createdAt DateTime  @default(now())
  @@map("user_invites")
}
```

Creating a user creates a row with status `invited` and an invite. The UI shows the raw link once: `/activate/<token>`. Reissuing an invite deletes the user's previous unused invites.

### 5.4 MFA

- **Who must use it:** MFA is required when `user.mfaRequired` is true, or when the user holds the `super_admin` or `admin` role.
- **Login:** these users get a session with `mfaPending=true`. A pending session can call only `/api/auth/mfa/*` and `/api/auth/logout`. Every other route treats it as unauthenticated (401) and redirects it to `/login/mfa`.
- **TOTP algorithm:** RFC 6238, HMAC-SHA1, 30-second step, 6 digits, using Web Crypto. It works on Node and on Workers.
- **Secret storage:** `User.mfaSecretEnc` holds the secret encrypted with AES-256-GCM (§7.2).
- **Replay protection:** `User.mfaLastStep` stores the last accepted time step. A code from that step or an earlier one is rejected.

New User fields: `mfaSecretEnc String?`, `mfaEnabledAt DateTime?`, `mfaLastStep Int?`.

### 5.5 Pages

| Page | Purpose |
|---|---|
| `/login` | Sign in. |
| `/login/mfa` | Enrol in MFA or enter a code. |
| `/activate/[token]` | Set a password from an invite. |
| `/account` | Change password and sign out. |

Pages use the existing design system (`src/app/globals.css` panels).

### 5.6 First production admin

- `scripts/create-admin.ts` creates the first admin. It reads `ADMIN_EMAIL`, `ADMIN_NAME` and `ORG_SLUG` from the environment.
- It creates a `super_admin` user with an invite and prints the activation URL **once**.
- It refuses to run if any user already holds `super_admin`, unless `--force-additional` is passed.
- It is run locally against prod `DIRECT_URL`.

## 6. Authorization

### 6.1 Actor

`src/lib/authz.ts` defines the actor type and how it is loaded:

```ts
type Actor = {
  userId: string; organizationId: string; email: string; fullName: string;
  sessionId: string;
  isSuperAdmin: boolean;
  globalPermissions: Set<string>;                 // from assignments with eventId null
  eventPermissions: Map<string, Set<string>>;     // eventId -> perms
};
getActorFromToken(rawToken: string | undefined): Promise<Actor | null>
getActor(): Promise<Actor | null>           // server components: reads next/headers cookies
actorFromRequest(req: Request): Promise<Actor | null>
```

Assignments with a non-null `revokedAt` are ignored.

### 6.2 Checks

- `can(actor, perm, eventId?)` returns true if any of these holds:
  - `globalPermissions` has `perm`;
  - `eventId` is given and `eventPermissions.get(eventId)` has `perm`.
- `requirePermission(actor, perm, eventId?)` throws `HttpError(403)` when `can` returns false.
- `requireEventAccess(actor, eventId)` loads the event and checks two things:
  - `event.organizationId === actor.organizationId`;
  - the actor holds a global role, or an event-scoped assignment for this event, or an `EventUserAccess` row for it.
- **Unknown event or wrong organization:** the response is `404 {error: "Not found"}`, so the response does not reveal whether the event exists.
- `accessibleEvents(actor)` lists the events an actor may see. It is used by the event switcher.

### 6.3 Route wrapper

Every route handler under `src/app/api/v1/**`, except `public/**` and `webhooks/**`, is wrapped:

```ts
export const GET = withActor(async (req, { actor, params }) => { ... });
```

`withActor` runs these steps in order:

1. **CSRF check.** For non-GET/HEAD methods, the `Origin` header must equal the app origin from `NEXT_PUBLIC_APP_URL`. A missing or different origin returns 403.
2. **Actor resolution.** If no actor resolves, or the session has `mfaPending`, the route returns `401 {error:"Unauthorized"}`.
3. **Error mapping.**
   - `HttpError` is turned into a JSON response with its status.
   - A zod validation error returns 400 with the validation issues.
   - Any other exception returns `500 {error:"Internal error"}`, with no stack trace, and is logged with a correlation ID.

Each handler then calls `requireEventAccess` and `requirePermission` with the event ID taken from the request. Records looked up by their own ID (guest, campaign, seat) are loaded first, and their `eventId` is checked; the client's claim is never trusted.

### 6.4 Route permission table

| Route | Method | Permission (event-scoped unless marked "global") |
|---|---|---|
| `events` | GET | Uses `accessibleEvents` only. |
| `events/[eventId]` | GET | `events.read` |
| `guests` | GET | `guests.read` |
| `guests` | POST | `guests.create` |
| `guests` | PATCH | `guests.update` (seat fields also need `seating.assign`) |
| `imports` | POST | `guests.import` |
| `protocol` | GET | `protocol.read` |
| `protocol` | POST, PATCH | `protocol.configure` |
| `campaigns` | GET | `campaigns.read` |
| `campaigns` | POST | `campaigns.create` |
| `campaigns/[id]` | GET | `campaigns.read` |
| `campaigns/[id]` PATCH `approve` | PATCH | `campaigns.approve`; the approver must not be the creator. |
| `campaigns/[id]` PATCH `dispatch` | PATCH | `campaigns.dispatch` |
| `campaigns/[id]` PATCH, other actions | PATCH | `campaigns.update` |
| `seating` | GET | `seating.read` |
| `seating` POST `auto_allocate` | POST | `seating.assign` |
| `seating` POST `manual_assign` | POST | `seating.assign` |
| `seating` POST `approve_plan` | POST | `seating.approve` |
| `check-in` | POST | `checkin.scan`. A supervisor override also needs `checkin.manual_override`. |
| `ai` | GET | `ai.use` |
| `ai` | POST | `ai.use`; tools are checked by the orchestrator. |
| `super-admin/**` | all | `platform.manage` (global) |
| `admin/users/**` (new) | all | `users.*` (global) |

### 6.5 Roles

Role-to-permission mappings are seeded in `prisma/seed.ts`. Roles are created idempotently by `prisma/roles.ts`, which every environment runs; it is not demo data.

| Role | Permissions |
|---|---|
| `super_admin` | All permissions. |
| `admin` (event owner) | All permissions except `platform.manage` and `integrations.manage`. |
| `protocol_officer` | `events.read`, `guests.*`, `protocol.*`, `rsvps.read`, `seating.read`, `reports.read`, `ai.use`, `ai.execute_read_tools` |
| `campaign_approver` | `events.read`, `guests.read`, `campaigns.read`, `campaigns.approve`, `invitations.read_activity`, `reports.read` |
| `seating_manager` | `events.read`, `guests.read`, `protocol.read`, `seating.*`, `reports.read` |
| `usher` | `events.read`, `checkin.scan` |

### 6.6 Page guards

- **`src/proxy.ts`:** if the session cookie is missing, it redirects `/`, `/guests…`, `/protocol…`, `/invitations…`, `/rsvps…`, `/seating…`, `/attendance…`, `/ai-centre…`, `/super-admin…`, `/usher…` and `/account` to `/login?next=<path>`. This is a fast path only: it reads the cookie and nothing else.
- **Layouts:** `(dashboard)/layout.tsx`, `super-admin/layout.tsx` and `usher/layout.tsx` call `getActor()`. If there is no actor, they `redirect('/login')`. If there is an actor without the required permission, they render a 403 panel.
- **Super admin pages:** `/super-admin` requires `platform.manage`.
- **Navigation:** nav items are filtered by permission. This is cosmetic only; the server is the boundary.

### 6.7 Current event selection

- Replace each `prisma.event.findFirst()` in the dashboard pages with `getCurrentEvent(actor)`.
- `getCurrentEvent` reads the `pf_event` cookie and accepts it only if the event ID is in `accessibleEvents(actor)`. Otherwise it falls back to the first accessible event.
- The Topbar gets an event switcher that sets the cookie through `POST /api/auth/event`.
- Client views that called `/api/v1/events` and used `data[0]` use the current event instead.

## 7. Secrets

### 7.1 Removal

- Delete `src/lib/env-manager.ts` and its import.
- Platform secrets come only from the runtime environment, set with `wrangler secret put` or locally from `.env`.

### 7.2 Encryption

- `src/lib/crypto.ts` provides `encryptSecret(plain)` and `decryptSecret(blob)`.
- Algorithm: AES-256-GCM through Web Crypto. Each value gets a random 12-byte IV. The stored blob is `v1:<b64 iv>:<b64 ciphertext+tag>`.
- The key is `APP_ENCRYPTION_KEY`: 32 random bytes, base64-encoded, held as a Worker secret and never in the database.

### 7.3 Integration credentials

- `IntegrationCredential` gains `secretCiphertext String?`. The `secretReference` field keeps a label.
- Rotating a key encrypts and stores the new value, marks the previous credential `rotated`, and returns only `maskedHint`.
- **R2 and extra credentials:** these are stored as separate encrypted credentials, never in `metadata`. A migration strips the keys `r2AccessKeyId`, `r2SecretAccessKey` and any key matching `/secret|token|key/i` from existing `metadata`.
- **Lookup:** `getProviderSecret(providerKey)` returns the decrypted active credential if one exists, and otherwise falls back to the environment variable. It is used by the email, SMS and AI adapters.
- **Responses:** API responses never include `secretCiphertext`. The overview route returns metadata through an allow-list of keys.

### 7.4 Startup validation

- `src/lib/config.ts` validates configuration with zod on first use.
- When `APP_ENV` is `staging` or `production`, these are required: `DATABASE_URL`, `APP_ENCRYPTION_KEY` (32 bytes once decoded), and `NEXT_PUBLIC_APP_URL` (https).
- On failure it throws `ConfigError`, naming the missing variables but never their values. `/api/health` reports `status: "error"`.
- The hardcoded Cloudflare account ID in `super-admin/integrations/test/route.ts` is removed and read from the environment.

## 8. Users and roles UI

- `/super-admin/users` lists users, their status, their roles and event scope.
- Actions available:
  - Invite a user (name, email, role, optional event). The invite link is shown once.
  - Reissue an invite.
  - Suspend or reactivate a user.
  - Grant or revoke a role, optionally scoped to an event.
  - Sign out everywhere.
  - Require MFA.
- APIs live under `/api/v1/admin/users`.
- Every action writes an audit entry: `user.invited`, `user.suspended`, `user.role_granted`, `user.role_revoked` and `user.sessions_revoked`.

## 9. Audit

The following actions are logged:

- `auth.login_succeeded`
- `auth.login_failed`
- `auth.logout`
- `auth.mfa_enrolled`
- `auth.mfa_failed`
- `auth.password_changed`
- every action listed in §8
- `integration.credential_rotated`

Audit entries never contain a password, token, TOTP secret or provider key.

## 10. Tests (G5)

| Test file | What it checks |
|---|---|
| `tests/security/route-sweep.test.mjs` | Discovers every `route.ts` under `src/app/api/v1`, excluding `public/**` and `webhooks/**`. Calls each exported method without a cookie and expects 401. Calls each method again as the seeded usher and expects 403, except the routes listed for the usher (`check-in` POST, `events` GET). The route list is discovered at run time, so new routes are covered automatically. |
| `tests/security/session.test.mjs` | A forged token gives 401. An expired session gives 401. An idle session gives 401. A revoked session gives 401. Logout revokes the session. Suspending a user kills their session. A revoked role assignment loses its permissions. |
| `tests/security/idor.test.mjs` | A second organization and event are seeded. A user scoped to event A gets 404 or 403 for event B's guests, campaigns and seating. |
| `tests/security/csrf.test.mjs` | A POST with a foreign `Origin` gets 403. |
| `tests/unit/totp.test.mjs` | Uses the RFC 6238 test vectors. |
| `tests/unit/crypto.test.mjs` | Checks that encryption and decryption round-trip, and that a tampered ciphertext is rejected. |

Existing tests that relied on the admin fallback are updated to authenticate.

## 11. Acceptance criteria

- **AC1 (G1):** No code path returns an actor without a valid session; the fallback is deleted. Covered by `session.test.mjs`.
- **AC2 (G2):** The route-sweep and IDOR tests pass.
- **AC3 (G3):** On staging, an invited user can activate, log in, complete MFA where required, change their password and log out.
- **AC4 (G4):** `git grep -n "writeFileSync\|env-manager" src` returns nothing. No API response contains `secretCiphertext` or R2 keys; this is checked by a test of the overview response.
- **AC5:** All of these pass: lint, typecheck and the full test suite in CI.
- **AC6:** The first super admin was created on staging with `scripts/create-admin.ts`.

## 12. Review resolutions (goldfish design and readiness reviews, 2026-11-05)

Where this table and §1–§11 disagree, this table wins.

| Finding | Resolution |
|---|---|
| Login is ambiguous across organizations (B1) | Email is globally unique and case-insensitive: `uq_users_email_ci` on `lower(email)`. Login takes only email and password. |
| MFA bypass: re-enrolment, unlimited guesses, no recovery (B2) | Re-enrolment is refused once MFA is enabled. A new secret is held in `mfaPendingSecretEnc` and promoted only after a correct code. Five wrong codes in 15 minutes revoke the pending session; failures are counted in `auth_attempts`. A super admin can run "Reset 2-step", which is audited. TOTP comparison is constant-time. The QR code is rendered in the browser from `otpauthUrl`. |
| Privilege escalation in user admin (B3) | `src/lib/user-admin.ts` enforces these rules: the target user and event must be in the actor's organization; users cannot change their own access; only a super admin can grant `admin` or `super_admin`, or act on an administrator account; otherwise the granted role's permissions must be a subset of the actor's own. An invite can be reissued only while the account is `invited`. |
| AI tools allow IDOR (B4) | `executeAiTool(name, args, actor)` authorizes `ai.use` and the tool's permission on `args.eventId`. Any seating plan or guest referenced must belong to that event. The `platform.manage` bypass is removed. GET and POST both require `ai.use`. |
| Lockout reveals which accounts exist, and allows denial of service (B5) | Attempts are stored in the `auth_attempts` table as HMAC keys for the email and the IP. Unknown emails are recorded exactly like known ones. A dummy bcrypt compare runs when the email is unknown. Limits are 5 failures per email and 30 per IP in 15 minutes. The client IP comes only from `CF-Connecting-IP`. |
| Exposed secrets need rotation (B6) | The owner confirmed on 2026-11-05 that all API keys will be deleted and reissued. New keys go in through `wrangler secret put` or the encrypted credential store. |
| CSRF on `/api/auth/*` (M1) | `withOrigin` wraps all auth routes and `withActor` wraps all `/api/v1` routes. The origin is compared with the runtime `APP_URL`, falling back to `NEXT_PUBLIC_APP_URL`. An anonymous request gets 401 before the origin check runs. |
| Authorization order (M2) | A single `authorizeEvent(actor, perm, eventId)` checks organization and event access first (404), then the permission (403). The legacy `getCurrentUser` and `hasPermission` are deleted. Revoked role assignments and revoked event access are ignored. |
| Roles (M3, readiness B2) | `syncRoles(prisma, orgId)` in `src/lib/roles.ts` is the single source of roles, used by both the seed and `scripts/create-admin.ts`. A `checkin_supervisor` role is added for Phase 4. The seeded admin holds `super_admin`. |
| Invite activation (M4) | The invite is consumed atomically (`updateMany`, then the affected row count is checked), and the account status must be `invited`. The password is validated before the invite is consumed. The token is sent in the POST body. `Referrer-Policy: no-referrer` is set on `/activate`, `/public` and `/check-in`. |
| Key management (M5) | HKDF derives separate keys for encryption and for keyed hashing. AES-GCM additional data binds each ciphertext to its `table:column:rowId`. Rotation and backup notes are in `src/lib/crypto.ts`. |
| Metadata leaks (M6) | An allow-list is applied to metadata on read and on write (`sanitizeMetadata`). Credentials are encrypted per `credentialKey`, which covers R2. Super-admin pages select only `maskedHint`. A migration removed secret keys already in metadata. |
| Proxy on Workers (M7) | `src/proxy.ts` only does an optimistic redirect; layouts and page guards are the boundary. The OpenNext build in CI verifies the proxy works. |
| bcrypt on Workers (M8) | Passwords are capped at 72 bytes. Login throttling limits CPU abuse. CPU time will be measured on staging. |
| Route sweep cannot run as specified (M9, readiness B1) | The sweep discovers routes at runtime and calls the handlers directly. Anonymous requests expect 401. An usher calling with real seeded IDs expects 403 or 404. A cross-origin POST expects 403. |
| Dashboard pages bypass authorization (readiness B4) | `guardPage(perm)` runs in every dashboard page. Layout guards protect `/usher`, `/super-admin` and `/guests/import`. Nav items declare a permission and are filtered on the server. |
| Client-side `data[0]` event selection | Clients call `GET /api/auth/event`, which returns the current event after a server-side access check. |
| Person and institution lookups are not scoped | Lookups in the guests and imports routes are scoped to `event.organizationId`. |
| Seating writes | Brought forward from Phase 2. The plan, section, seat and guest must belong to the event. Assignment runs in a transaction with `SELECT … FOR UPDATE` on the section and writes its audit row in the same transaction. A violation of the partial unique index returns 409. |
| Check-in | Interim until Phase 4. Requires `checkin.scan`; an override also requires `checkin.manual_override` and a reason. The guest must belong to the event, and a declined RSVP blocks entry. The unique index prevents concurrent duplicate check-ins. |
| Campaign approval | Requires `campaigns.approve`. The approver must not be the creator, the campaign must be in `pending_approval`, and the template version must belong to the event. |
