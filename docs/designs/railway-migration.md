# Move hosting to Railway, media to Cloudflare R2

Status: draft, awaiting owner approval
Date: 2026-11-07
Branch: `phase-0-foundation`

## 1. Decisions already made by the owner

| Topic | Decision |
|---|---|
| App hosting | Railway, existing project **Gov Festival**. Cloudflare Workers is retired. |
| Database | Railway Postgres in the same project. Neon is no longer used. |
| Existing data | **Start fresh.** Nothing is copied from Neon. |
| Media, images, assets | Cloudflare R2. |
| First account | Super admin `dakyayipah@gmail.com`, password set at bootstrap by the owner's choice. |

## 2. Current state (what changes)

**Update 2026-11-07:** the Railway project already runs this branch. It has `gov-festival-app` (GitHub autodeploy from `phase-0-foundation`, pre-deploy `npx prisma migrate deploy`, domain `https://gov.dakyx.com`), `gov-festival-cron` and `Postgres`. §3.1, §3.3, §3.5 and the database half of §3.6 already exist. What remains is the code cleanup (§3.2, §3.7), the R2 module (§3.4) and the admin password.

- `src/lib/db.ts` has two runtimes. On Workers it loads the Prisma WASM client with the Neon adapter, one client per request. On Node it uses one long-lived TCP client.
- `worker.ts` wraps the OpenNext bundle and adds a one-minute Cron Trigger that POSTs `/api/internal/tick` with `CRON_SECRET`. The tick drains the campaign send queue.
- `src/app/api/v1/campaigns/[campaignId]/route.ts` uses `getCloudflareContext().ctx.waitUntil()` to start sending right away.
- `next.config.ts` calls `initOpenNextCloudflareForDev()` and externalises Prisma for the Workers bundle.
- `wrangler.jsonc`, `open-next.config.ts`, `.github/workflows/deploy.yml`, `.github/actions/deploy` and the `wrangler deploy --dry-run` step in `ci.yml` exist only for Cloudflare.
- **No feature uploads media today.** R2 credentials can be saved in Super Admin → Integrations, but nothing reads or writes R2. `public/` holds 121 KB (favicon, logo, fonts) and is served by the app.

## 3. Target design

### 3.1 Runtime

- Railway service `web` builds from this repo with Railpack (Node detected from `package.json`).
  - Build: `npm ci && npx prisma generate && npm run build`.
  - Pre-deploy: `npx prisma migrate deploy`. A failed migration stops the release, and the old version keeps serving.
  - Start: `npm start` (`next start -p $PORT`).
  - Health check: `/api/health`.
- Config lives in `railway.json` in the repo, so builds are reproducible.
- One replica. The campaign queue claims rows with locks, so more replicas would also be safe later.

### 3.2 Database client

- `src/lib/db.ts` becomes the Node path only: one `PrismaClient` per process. Remove the Workers branch, `runWithTaskClient`, the WASM client and `@prisma/adapter-neon`.
- `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway private network). `DIRECT_URL` = the same value, because there is no pooler in between.

### 3.3 Background work (replaces the Cron Trigger)

- **Already in place (found 2026-11-07):** the Railway service `gov-festival-cron` runs `curlimages/curl` in a loop, POSTing `$TICK_URL` with `Bearer $CRON_SECRET` every 60 seconds. It is kept as-is. No in-app timer is added.
- `/api/internal/tick` is unchanged.
- The campaign route's `waitUntil` (a Workers API, a silent no-op on Node) is replaced by a detached promise with `.catch` logging, so sending starts right away. A Node server keeps running after the response is sent.

### 3.4 Media on R2

- Add `src/lib/storage.ts`: a small S3-compatible client (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) pointed at the R2 endpoint.
  - `putObject(key, body, contentType)`
  - `signedGetUrl(key, ttl)`
  - `deleteObject(key)`
- Credentials come from env (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `R2_PUBLIC_BASE_URL`). If env is empty, they fall back to the Integrations record that already exists.
- The bucket is private by default. Pages get signed URLs. A public custom domain is optional, only for assets that are meant to be public, such as the logo on guest passes.
- Every future upload feature uses this module. **No existing feature is rewritten**, because none uploads anything.
- `public/` (favicon, fonts, logo) stays bundled with the app. Moving 121 KB of build assets to R2 adds a network hop and saves nothing. The owner can override this (see §7).

### 3.5 Environment on Railway (`web` service)

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `APP_URL` | Railway public domain, e.g. `https://web-production-xxxx.up.railway.app`, or a custom domain later |
| `DATABASE_URL`, `DIRECT_URL` | `${{Postgres.DATABASE_URL}}` |
| `APP_ENCRYPTION_KEY` | **New** 32-byte key. Fresh DB, so no old ciphertext needs it. A backup is given to the owner. |
| `CRON_SECRET` | New, 48 random bytes |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | From owner (or entered later in Super Admin) |
| `R2_*` | From owner |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `VYNFY_API_KEY` | From owner, optional |

Secrets are set with `railway variables --set` and never committed.

### 3.6 Bootstrap

1. `prisma migrate deploy` (pre-deploy).
2. `scripts/create-admin.ts` with `ADMIN_EMAIL=dakyayipah@gmail.com`, `ORG_SLUG=parliament-gh`.
3. `scripts/set-password.ts` with the owner's chosen password, passed as an env var for that one command only.
4. The owner signs in and enrols MFA.

The demo seed (`prisma/seed.ts`) is **not** run in production.

### 3.7 Removals

- Files: `worker.ts`, `wrangler.jsonc`, `open-next.config.ts`, `.github/actions/deploy/`, `.dev.vars.example`.
- Packages: `@opennextjs/cloudflare`, `wrangler`, `@prisma/adapter-neon`, `@neondatabase/serverless`.
- `package.json` scripts: `build:worker`, `preview`, `deploy:*`.
- `next.config.ts`: the OpenNext dev hook and `serverExternalPackages`.
- CI: drop the wrangler dry-run. Replace `deploy.yml` with Railway's GitHub autodeploy for this branch, or a `railway up` job using a `RAILWAY_TOKEN` secret. Recommendation: Railway autodeploy from `phase-0-foundation`, with "wait for CI" switched on.
- UI copy that names Cloudflare Workers or Neon (Super Admin overview) is updated.

### 3.8 Cloudflare and Neon retirement

- The old Worker keeps running until Railway is verified (§5). After that the owner decides whether to delete it, because deleting cannot be undone.
- The Neon project is left alone. The owner can delete it in the Neon console.
- R2 stays: it is now the media store.

## 4. Unchanged

- All app routes, auth, MFA, sessions, RBAC, the tests (they already use the Node path), and the Prisma schema. The `purpose` column migration from the password reset work ships in the first Railway deploy.

## 5. Verification

1. `npx tsc --noEmit`, `npm run lint`, `npm run build` pass locally.
2. The test suite passes against a throwaway Railway Postgres (or CI).
3. After deploy:
   - `/api/health` returns 200 and reports the commit.
   - Sign-in with the super admin works, then MFA enrolment.
   - Forgot-password sends an email.
   - A queued test campaign is sent within about 1 minute.
   - `storage.ts` round-trips a test object to R2, then deletes it.
4. Logs show the background tick running once per minute and no errors.

## 6. Rollback

Railway keeps prior deployments, so redeploy the previous one. The Cloudflare Worker stays up until the owner retires it, so pointing users back to the old URL is possible during the switch-over.

## 7. Open questions for the owner

1. **Static assets:** keep `public/` (logo, fonts, favicon) bundled with the app (recommended), or serve them from R2 too?
2. **R2 bucket:** reuse `dakyxtech-private`, or create a new bucket `parliament-festival-media`? (Recommended: a new one, so this app's files are kept apart.)
3. **Domain:** Railway's `*.up.railway.app` domain for now, or a custom domain?
4. **Keys:** the R2 and Resend keys pasted in chat earlier were to be rotated. New ones are needed.
