# Production Release Gates (spec §24.1)

**Audience:** the platform owner and the event leadership.
**Status:** as of 2026-11-05. The code work for Phases 0–6 is complete on branch `phase-0-foundation`. Every gate below that needs live infrastructure or people is still open.

## Gates

| # | Gate | Status | Evidence / what remains |
|---|---|---|---|
| 1 | Authentication fallback removed | ✅ Done | `src/lib/auth.ts`; `tests/security/session.test.mjs` |
| 2 | Session security and revocation tested | ✅ Done | Expired, idle, revoked and suspended sessions, logout, and forged cookies are all tested |
| 3 | Every sensitive API has authorization tests | ✅ Done | `tests/security/route-sweep.test.mjs` discovers every route automatically |
| 4 | Organization, event and gate scoping enforced | ✅ Done | IDOR tests (`tests/security/idor.test.mjs`); gate tests (`tests/checkin`) |
| 5 | Secrets protected | ⚠️ Code done; **owner action open** | Secrets are encrypted at rest, masked in the UI and allow-listed in metadata. **You still need to rotate every leaked key:** Neon, Cloudflare, JWT, Gemini, Postmark, and any R2, Resend or Vynfy keys that were ever in `.env`. |
| 6 | Email and SMS success/failure reported truthfully | ✅ Email / ⚠️ SMS | Resend reports truthfully (tests). Vynfy's send call is real, but its response schema and delivery receipts are **undocumented**. Ask Vynfy for the full API reference. |
| 7 | Campaign sending durable and idempotent | ✅ Done | `tests/comms/campaign-queue.test.mjs` |
| 8 | Invitation and RSVP tokens secure | ✅ Done | `tests/integrity/public-invitation.test.mjs` |
| 9 | QR GET requests read-only | ✅ Done | Read-only scan page; tests count rows before and after |
| 10 | Check-in confirmation authorized and atomic | ✅ Done | `tests/checkin`; 20-way concurrency test |
| 11 | Duplicate check-in tests pass | ✅ Done | Same as above |
| 12 | Seating capacity tests pass | ✅ Done | 20-way capacity-1 test; engine overflow test |
| 13 | Audit logs available | ✅ Done | Audit report export; entries for login, roles, RSVP, check-in, seating, campaigns, AI and exports |
| 14 | Backups and restore tested | ❌ Open | Needs Neon production. Rehearse the point-in-time restore in `docs/runbooks/deploy-and-rollback.md`. |
| 15 | Production monitoring and alerting active | ❌ Open | Enable Workers observability alerts (error rate, cron failures) and Neon alerts after the first deploy. |
| 16 | Real-device usher tests on iPhone and Android | ❌ Open | Run on staging with real phones (camera → scan link → confirm). |
| 17 | Administrators and ushers rehearsed | ❌ Open | Use `docs/runbooks/event-day-checkin.md`. |
| 18 | Incident escalation and manual contingency documented | ✅ Documented | Both runbooks; escalation contacts still need filling in. |

## Owner actions required to deploy

The deploy workflow is ready (`.github/workflows/deploy.yml`). It cannot run until you complete these steps.

1. **Rotate all leaked credentials.** See gate 5.
2. **Cloudflare.**
   - Subscribe to Workers Paid. bcrypt CPU time needs more than the Free plan allows; the bundle is about 2.7 MiB gzipped.
   - Create a scoped API token.
   - Create a Cloudflare Access application covering both Worker hostnames.
   - Create an Access service token for CI.
3. **Neon.**
   - Create a project with a `staging` branch and a `main` branch.
   - Copy the pooled and direct connection strings for each.
4. **GitHub.**
   - Create the `staging` and `production` environments.
   - In each, add the secrets: `DATABASE_URL`, `DIRECT_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.
   - In each, add the variable `APP_URL`.
   - Add a required reviewer to `production`.
   - Protect the `main` branch.
5. **Worker secrets.** Run `wrangler secret put` for each environment. The full list is in the README.
6. **Merge and deploy.**
   - Merge `phase-0-foundation` into `main`. Staging then deploys automatically.
   - Run `scripts/create-admin.ts` against staging.
   - Complete the open gates.
   - Deploy production through the **Deploy** workflow.
7. **Configure providers.**
   - Resend: verify the sending domain. In the domain settings, turn on **open tracking** and **click tracking**. Add a webhook pointing at `<APP_URL>/api/v1/webhooks/email` and subscribe it to these events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed`, `email.delivery_delayed`, `email.opened` and `email.clicked`. Then set the webhook's signing secret as `RESEND_WEBHOOK_SECRET`.
   - Vynfy: register the sender ID.
   - OpenAI: set `OPENAI_MODEL`.

## Known residual items (not launch blockers by themselves)

- **ESLint `no-explicit-any` is a warning, not an error.** There are 162 warnings, all in legacy UI code.
- **`npm audit`: 3 high findings via the Prisma CLI (`deepmerge-ts`).** The CLI runs only at build and migrate time. Fixing it needs Prisma 7, a breaking upgrade, so schedule it after the event.
- **Phase 5 usability backlog:** see `docs/designs/phase-5-operations.md` §3.
