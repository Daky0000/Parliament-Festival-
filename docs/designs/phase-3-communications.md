# Phase 3: Truthful Communications and Durable Sending

| Field | Value |
|---|---|
| Status | Implemented under the owner's standing instruction (2026-11-05) |
| Depends on | Phase 2 |
| Source spec | Remediation spec §3.3, §3.4, §3.5, §8.3–§8.7, §17.3 |

## 1. Problems found in the audit

- **Resend email.** Provider errors were caught and the code carried on as if the send had worked. A failed send still got a fabricated message id and was marked "sent", and mock mode marked mail "delivered".
- **Email webhook.** It accepted any JSON. Its `signatureValid: true` was hard-coded.
- **Vynfy SMS.** No HTTP request was ever made: message ids were fabricated and every send was reported as a success. The kill switch failed open, and the idempotency key was random on every call.
- **Campaigns.** Sending ran in one HTTP request as a `for` loop. A crash left the campaign stuck in "sending" forever. Nothing was retried or idempotent, there was no pause or cancel, and every campaign ended "completed" whether or not mail went out.

## 2. Provider contracts used (and their gaps)

| Provider | Documented and used | Not documented, so not implemented |
|---|---|---|
| Resend (resend.com/docs) | `POST https://api.resend.com/emails`, Bearer token, `Idempotency-Key` header (24 h), success body `{id}`. Webhooks delivered through Svix, verified with the official `svix` library (`svix-id`, `svix-timestamp`, `svix-signature`). Event names `email.sent`, `email.delivered`, `email.bounced` (`data.bounce.type`), `email.complained`, `email.failed`, `email.opened`, `email.clicked`, `email.delivery_delayed`, `email.suppressed`. Payload field `data.email_id`. | The exact error body. The adapter classifies failures by HTTP status. |
| Vynfy (vynfy.com/developers) | `POST https://sms.vynfy.com/api/v1/send`, header `X-API-Key`, JSON body `{sender, recipients: ["233…"], message}`. | Response body, message id, error format, delivery receipts and webhook signing. |

**What the Vynfy gaps mean in practice:**

- A 2xx response is recorded as "submitted".
- The raw response is stored in `communication_messages.providerResponse`.
- `providerMessageId` stays null, and delivery status is never reported.
- **Owner action:** ask Vynfy for the full API reference: the response schema, the delivery-receipt webhook and how it is signed. Delivery receipts can then be added without guessing.

## 3. Design

### 3.1 Email (`src/lib/email/resend.ts`, `src/lib/email/provider.ts`)

- The adapter returns one of two results:
  - `{ok: true, providerMessageId}` on a 2xx response that includes an id;
  - `{ok: false, retryable, code, message}` otherwise. Network errors, 408, 409, 429 and 5xx are retryable; any other 4xx is permanent.
- Every send attempt writes one `EmailAttempt` row: `submitted` with the provider's real id, or `failed` with the real error.
- An invitation becomes `sent` only when the provider accepts the message.
- Mock mode is possible only when `APP_ENV` is not `production`, and it is the default there.

### 3.2 Webhooks (`/api/v1/webhooks/email`)

- The route verifies the signature against the raw body using `RESEND_WEBHOOK_SECRET` (or the encrypted `webhookSecret` credential). An invalid signature returns 401. If no secret is configured, it returns 503.
- Each delivery is stored once, keyed on the `svix-id`. A concurrent duplicate is treated as a duplicate, not an error.
- **Status precedence:**
  - The order is `failed < submitted < deferred < delivered < bounced/rejected`.
  - A lower state never overwrites a higher one, so a late `delivered` cannot undo a bounce.
  - Opens and clicks are stored as engagement events only. The UI calls them "tracked opens", never "read".
- A permanent bounce or a complaint adds the address to the `suppressions` table. Campaigns skip suppressed addresses.

### 3.3 SMS (`src/lib/sms/vynfy.ts`)

- **Phone numbers:** strictly Ghana E.164, `+233` followed by `[235]` and 8 more digits. Anything else returns `invalid_number`.
- **Segments:** GSM 03.38 counting with the extension table, where each extension character costs 2 septets. Messages that need Unicode fall back to UCS-2 and are split into 70/67-unit segments.
- **Kill switch:** fails closed. The send is blocked if the integration row is missing, disabled, or has `emergencyKillSwitchActive` set.
- **Duplicates:** the caller passes a stable `idempotencyKey`. Repeating the key returns the earlier result instead of sending again.
- **Suppressed numbers:** never sent to.

### 3.4 Campaign queue (`src/lib/campaigns/engine.ts`)

- **Dispatch** first requires the campaign to be approved. It then:
  1. creates one `campaign_recipients` row per eligible guest, unique on (campaign, guest, channel);
  2. marks suppressed addresses `suppressed`;
  3. sets the campaign to `sending` and returns 202.
- **Processing:**
  - `processQueue()` claims due rows (status `queued`, or `processing` with an expired lease) using `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` and a 5-minute lease.
  - It is safe to run concurrently and repeatedly.
  - The recipient row's id is sent as the Resend `Idempotency-Key`.
  - Each recipient gets one invitation, created once and reused on retry.
- **Retries:** retryable failures are retried with exponential backoff and ±20% jitter, starting at 30 s and capped at 30 min. After 5 attempts, or on a permanent failure, the row becomes `failed`, which acts as the dead letter.
- **Controls:**
  - pause: `sending` → `paused`. The queue skips paused campaigns.
  - resume.
  - cancel: rows not yet claimed become `cancelled`. This is the documented point after which a send can no longer be stopped.
  - `retry_failed`.
- **Completion:** a campaign becomes `completed` when no rows are left in flight.
- **Progress:** counts for queued, processing, accepted, delivered, bounced, failed, suppressed and cancelled. "Accepted" means accepted by the provider. It is not reported as delivered.

### 3.5 Scheduling

- `wrangler.jsonc` sets `triggers.crons = ["* * * * *"]`.
- `worker.ts` wraps the OpenNext worker. Its `scheduled` handler calls `POST /api/internal/tick` in-process, using the existing Next handler. This keeps a single application bundle and means Cloudflare Access does not apply to the call.
- `/api/internal/tick` requires `Authorization: Bearer $CRON_SECRET` (at least 32 characters), checked with a constant-time comparison. Any other caller gets 404.
- Dispatch also starts work immediately through `ctx.waitUntil(processQueue())`.
- No Cloudflare Queues product is needed, so this works on any Workers plan.

### 3.6 Workers database client

`src/lib/db.ts` gives each request its own client:

- A Prisma client is cached per Cloudflare request context, using a `WeakMap` keyed on `getCloudflareContext().ctx`.
- Background tasks use `runWithTaskClient()`, backed by `AsyncLocalStorage`. A task client can never leak into a concurrent request.

## 3.7 Email engagement (opened / clicked)

Each campaign shows these counts, per invitation, in `GET /api/v1/campaigns/[id]` and in the campaign card:

| Count | Source | Accuracy |
|---|---|---|
| **Sent** | Provider accepted | — |
| **Tracked opens** | Resend `email.opened` (image pixel) | A signal only: Apple Mail privacy loads it automatically, and some clients block images. |
| **Button clicks** | Resend `email.clicked` on the RSVP button | Can include link scanners. |
| **Opened RSVP page** | The page script running in a real browser | The most reliable sign that a person opened the invitation. |
| **Responded** | An RSVP was submitted | — |

Open and click events arrive only if open/click tracking is enabled on the Resend domain and the webhook subscribes to those events.

## 4. New secrets and variables

| Name | Where it is set | Purpose |
|---|---|---|
| `APP_URL` | Worker var or secret, per environment | Public origin. Used for links, the CSRF origin check and the cron target. |
| `CRON_SECRET` | Worker secret (32+ random characters) | Authenticates the cron tick. |
| `RESEND_WEBHOOK_SECRET` | Worker secret (`whsec_…`) | Verifies Resend webhooks. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Worker secrets | Email sending. Production forces the Resend provider. |
| `VYNFY_API_KEY`, `VYNFY_SENDER_ID` | Worker secrets | SMS. The sender ID must be registered with Vynfy. |

## 5. Acceptance criteria

All of these pass in `tests/comms/*` and `tests/e2e/*`.

| # | Criterion |
|---|---|
| AC1 | A provider 5xx, 429, 4xx, or a 2xx with no id is never recorded as success. |
| AC2 | A forged webhook signature returns 401. A replayed `svix-id` is processed once. A late `delivered` does not undo a bounce. A permanent bounce suppresses the address. |
| AC3 | Dispatching twice creates no duplicate recipients. Draining the queue sends exactly one email per guest. Further ticks do nothing. |
| AC4 | A row left in `processing` with an expired lease is completed exactly once. |
| AC5 | A paused campaign is not processed. Cancel stops every unsent recipient. A cancelled campaign cannot be resumed. |
| AC6 | Transient failures back off, become `failed` after 5 attempts, and can be recovered with `retry_failed`. |
| AC7 | The SMS kill switch fails closed. Invalid numbers are rejected. A repeated idempotency key sends once. No SMS message id is fabricated. |
| AC8 | The end-to-end journey works: create, approve by a second person, dispatch, queue, verified delivery, RSVP, pass, check-in, and duplicate refusal. |
