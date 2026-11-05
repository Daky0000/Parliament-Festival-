# Phase 2: Data Integrity and Guest-Facing Token Lifecycle

| Field | Value |
|---|---|
| Status | Approved under the owner's standing instruction (2026-11-05) |
| Depends on | Phase 1 (`docs/designs/phase-1-security.md`) |
| Source spec | Remediation spec §3.6, §3.7, §7.3, §9, §10, §15, §16.2 |

## 1. Problems found in the audit

- Public `GET /api/v1/public/invitations/[token]` writes a `link_access` row on every request. That includes email scanners and link previews, so a "view" does not mean a person opened the link.
- The public endpoints never check token expiry, revocation, invitation status, event status or the RSVP deadline.
- RSVP validation is weak:
  - `Number(x) || 0` accepts negative and fractional companion counts;
  - `notes` is unbounded;
  - the RSVP and the credential are written outside a transaction.
- The QR code encodes the *stored* `credentialHash`, so reading the database is enough to forge passes. The hash is also returned in the API response.
- Accepting an RSVP again creates another active credential. Declining afterwards revokes nothing.
- When an invitation is created from the guest form or a campaign, its raw token is discarded. The guest's link can never be rebuilt, for example to resend it.
- Reference codes come from `Math.random`, giving 9,000 possible values; collisions crash the RSVP.
- The audit log records full personal data on guest creation, and it does not record RSVPs.
- Postgres enforces none of the status-value or count constraints. They exist only in the archived legacy SQL.
- Events cannot be created, and their status cannot change. There are no lifecycle guards.

## 2. Design

### 2.1 Token storage (`src/lib/guest-tokens.ts`)

- **Invitation token:** 32 random bytes.
  - The database stores `tokenHash` (SHA-256) and `tokenEnc`, which is AES-GCM encrypted with context `invitations.tokenEnc:<id>`.
  - The raw token can be decrypted, so the same link can be re-sent.
  - Reading the database alone gives no usable link without `APP_ENCRYPTION_KEY`.
- **QR credential token:** 32 random bytes.
  - The database stores `credentialHash` and `tokenEnc` (context `qr_credentials.tokenEnc:<id>`).
  - The QR code encodes `<APP_URL>/check-in/scan/<raw>`: an HTTPS link that a phone's built-in camera app can open. This is spec §11.11, option A.
  - Neither the hash nor the raw token appears in any staff API response.
- **Reference codes:** 8 characters of Crockford base32 from `crypto.getRandomValues`, for example `GH-GST-7K3QX9PA`. On a unique-key collision the code is regenerated, at most 5 times.

### 2.2 Public invitation API (`/api/v1/public/invitations/[token]`)

#### GET is read-only

GET writes nothing. It returns the invitation view. If the latest RSVP is "accepted" and an active credential exists, it also returns `qrCodeDataUrl`. The QR code is built on the server from the decrypted credential token, so the guest can always re-open their pass.

#### POST

POST takes a body discriminated on `action`:

| `action` | Body | Effect |
|---|---|---|
| `"view"` | none | Records `link_access` with `source: "page_script"`. Only a real browser running the page's JavaScript sends it. |
| `"rsvp"` | `response`, `companionCount`, `notes` | Submits an RSVP. |

#### Validation, in order

1. **Token.** The token's length must be 20–100 characters. A matching invitation must exist, have no `tokenRevokedAt`, not be past `tokenExpiresAt`, and not have status `revoked` or `superseded`. If any check fails, the response is 404 with one generic message, so it never says which check failed.
2. **Event.** If the event's status is `cancelled` or `archived`, the response is 410: "This event is no longer accepting responses."
3. **RSVP deadline.** If `now > rsvpDeadline`, an RSVP returns 409 "The RSVP deadline has passed." The GET view stays available.
4. **Fields.** Checked with zod:
   - `response` is `accepted` or `declined`;
   - `companionCount` is an integer from 0 up to the guest's `companionAllowance` (forced to 0 when declining);
   - `notes` is at most 1,000 characters.
5. **Rate limit.** `auth_attempts`, kind `rsvp`, keyed by the token hash: 10 submissions per 15 minutes. The view action uses kind `public_view` with a limit of 60.

#### RSVP transaction

All of these happen in one transaction:

- A new `Rsvp` row is appended, with `supersedesRsvpId` pointing at the previous RSVP. History is never overwritten.
- **Accepted:** if an active, unexpired credential exists, it is reused. Otherwise one is issued.
- **Declined:** every active credential for the invitation is revoked.
- An audit row `rsvp.submitted` is written with `{response, companionCount}`. It holds no personal data.

### 2.3 Invitation creation

`issueInvitation(tx, {...})` in `src/lib/guest-tokens.ts` is the only way an invitation is created. The guest form and the campaign dispatch path both call it. The function returns the raw token so the caller can build the RSVP URL.

### 2.4 Database constraints

Migration `…_integrity_checks` adds CHECK constraints, which were ported from the legacy SQL and adapted to the camelCase columns:

| Table | Constraints |
|---|---|
| `rsvps` | `response` IN (accepted, declined, pending_clarification); `companionCount` ≥ 0 |
| `event_guests` | `companionAllowance` ≥ 0; `guestStatus` IN (active, archived, withdrawn) |
| `seating_sections` | `capacity` ≥ 0 |
| `protocol_categories` | `rankOrder` > 0 |
| `seat_assignments` | `status` IN (proposed, approved, released, cancelled); `assignmentType` IN (principal, companion, group_block) |
| `attendance_records` | `checkinStatus` IN (checked_in, reversed, exception); `checkinMethod` IN (qr, manual, offline_sync, supervisor_override, fast_track, contingency) |
| `qr_credentials` | `status` IN (active, revoked, expired) |
| `invitations` | `invitationStatus` IN (prepared, queued, sent, failed, revoked, superseded) |
| `events` | `status` IN (draft, scheduled, active, completed, archived, cancelled) |

The constraints also need these indexes:

- a partial unique index on `qr_credentials(invitationId) WHERE status = 'active'`, which allows one active credential per invitation;
- an index on `invitations(eventId, eventGuestId)`;
- an index on `rsvps(invitationId, submittedAt)`.

`scripts/check-indexes.ts` gains the new unique index. The migration runs against seeded data in CI, so a constraint that the data violates fails the build.

### 2.5 Event lifecycle

Events have six states: `draft`, `scheduled`, `active`, `completed`, `archived` and `cancelled`.

| From | Allowed next states |
|---|---|
| `draft` | `scheduled`, `cancelled` |
| `scheduled` | `active`, `draft`, `cancelled` |
| `active` | `completed`, `cancelled` |
| `completed` | `archived` |
| `cancelled` | `archived` |
| `archived` | none |

Every state change is audited.

Endpoints:

- `POST /api/v1/events` creates an event. It needs global `events.create`; new events start as `draft`.
- `PATCH /api/v1/events/[eventId]` handles two cases:
  - `{action: "update", ...fields}` requires `events.update`;
  - `{action: "transition", to}` requires `events.update`, or `events.archive` when moving to `archived`.

Cancelled and archived events reject RSVP (see §2.2) and check-in (`authorizeEvent` is unchanged; the check-in route checks event status).

### 2.6 Audit

- Guest creation no longer stores personal data. It records `{guestId, protocolCategoryId, hasEmail}`.
- The RSVP and event-transition audit rows are written inside their transactions.

### 2.7 Deferred to Phase 5

The CSV/XLSX import mapping UI, duplicate-merge review and export formula-injection protection are deferred to Phase 5. That is where reports and exports are built. The current import already has preview/commit and duplicate warnings.

## 3. Acceptance criteria

- **AC1:** Public GET performs no write. A test counts `invitation_events` before and after a GET and expects no change.
- **AC2:** Each of these returns the documented status: an expired, revoked or superseded token; a cancelled event; and a submission after the deadline.
- **AC3:** Companion counts of −1, 1.5, `"abc"` and allowance+1 are each rejected with 400.
- **AC4:** Accepting twice leaves exactly one active credential. Declining afterwards leaves zero.
- **AC5:** The QR payload is an `/check-in/scan/` URL. Its token hashes to `credentialHash`. No API returns `credentialHash`.
- **AC6:** Twenty concurrent manual seat assignments into a capacity-1 section produce exactly one success.
- **AC7:** Twenty concurrent check-ins for one guest produce exactly one attendance record.
- **AC8:** The CHECK constraints reject an invalid `rsvps.response`.
- **AC9:** Every event transition outside the table is rejected with 409.
