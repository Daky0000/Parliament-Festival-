# Parliament of Ghana — Event & Protocol Platform

Platform for the **2026 Festival of Nine Lessons and Carols**: guest registry, invitations, RSVP, protocol ranks, seating and usher check-in.

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16 (App Router), deployed to **Cloudflare Workers** with `@opennextjs/cloudflare` |
| Database | **Neon Postgres** through Prisma 6. The Neon serverless adapter is used on Workers; plain TCP is used on Node |
| Static assets | `public/` (served by the Worker). Email images and fonts are in `public/assets/` |
| CI/CD | GitHub Actions: `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` |

Design specs for each remediation phase are in `docs/designs/`.

## Local development

1. Install dependencies. This also runs `prisma generate`.

   ```sh
   npm install
   ```

2. Start a local Postgres. Use either option:
   - **Option A:** Prisma's built-in server: `npx prisma dev -n pf -d`. It prints the TCP URL. Append `&pgbouncer=true&connection_limit=1` to that URL.
   - **Option B:** Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17`

3. Set `DATABASE_URL` and `DIRECT_URL` to that URL in `.env`. Copy the other variable names from `.dev.vars.example`. Set `APP_ENV=local` and `EMAIL_PROVIDER=mock`.

4. Apply migrations, seed, and run:

   ```sh
   npm run db:migrate         # apply prisma/migrations
   npm run db:check-indexes   # confirm the partial unique indexes exist
   SEED_PASSWORD=... npm run db:seed   # demo data; refuses to run when APP_ENV is production
   npm run dev
   ```

## Checks

```sh
npm run lint
npm run typecheck
npm test          # needs a migrated and seeded database; real providers are always mocked
```

`npm run build:worker` produces the Cloudflare bundle. It needs Linux or WSL: OpenNext creates symlinks that Windows refuses without Developer Mode. CI builds it on Linux.

## Database migrations

- Create a migration with `npx prisma migrate dev --create-only --name <name>`, then review the SQL before committing.
- `prisma/migrations/20261105000100_partial_unique_indexes` holds indexes that Prisma cannot model. **Never accept a generated migration that drops `uq_*` indexes.** CI fails if any is missing.
- Write migrations as expand/contract: add the new column or table first, ship code that uses it, and remove the old one in a later release. This keeps the previous Worker version compatible during rollback.

## Deploying

| Environment | Trigger | Worker |
| --- | --- | --- |
| Staging | Automatic after CI passes on `main` | `parliament-festival-staging` |
| Production | Manual run of the **Deploy** workflow with a commit SHA. Requires approval in the `production` GitHub Environment | `parliament-festival-production` |

Each deploy follows the same sequence:

1. Run `prisma migrate deploy` against Neon.
2. Build and deploy with OpenNext.
3. Smoke-test `/api/health` and check that it reports the deployed SHA.
4. If the smoke test fails, the Worker rolls back automatically.

Both environments sit behind Cloudflare Access. CI reaches them with an Access service token.

Rollback procedures are in `docs/runbooks/deploy-and-rollback.md`.

### Required configuration

Set each of these per GitHub Environment (`staging` and `production`):

- **Secrets:**
  - `DATABASE_URL` (Neon pooled)
  - `DIRECT_URL` (Neon direct)
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CF_ACCESS_CLIENT_ID`
  - `CF_ACCESS_CLIENT_SECRET`
- **Variable:** `APP_URL`

Set each of these per Worker with `wrangler secret put <NAME> --env <env>`:

- `DATABASE_URL` (Neon pooled)
- `APP_URL` (public https origin, used for links, the CSRF check and the cron)
- `APP_ENCRYPTION_KEY` (32 random bytes, base64; keep an offline backup)
- `CRON_SECRET` (32+ random characters; authenticates the background tick)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`
- `VYNFY_API_KEY`, `VYNFY_SENDER_ID`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (optional)

Background work (the campaign queue) runs from a Cron Trigger every minute; see `worker.ts`.

### Email open tracking

Every invitation email (campaign or the one-click **Send Email** in the Guest Directory) carries a
signed 1x1 image served from `APP_URL` at `/api/v1/public/track/open/<token>.gif`, so opens are
recorded per dignitary without depending on Resend's own open tracking. `APP_URL` must be the
public https origin the recipient can reach. Point a Resend webhook at `/api/v1/webhooks/email`
(with `RESEND_WEBHOOK_SECRET`) to also get delivered, bounced and click events. An open is a
signal, not proof: Apple Mail pre-loads images and Outlook may block them, so a button click or an
RSVP page visit also counts as "opened".

To create the first administrator in a new environment, run `scripts/create-admin.ts` (instructions are at the top of the file).

**Never commit secrets.**
