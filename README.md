# Parliament of Ghana — Event & Protocol Platform

Platform for the **2026 Festival of Nine Lessons and Carols**: guest registry, invitations, RSVP, protocol ranks, seating and usher check-in.

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16 (App Router) on **Railway** (`next start`, Node), project **Gov Festival**, service `gov-festival-app` |
| Database | **Railway Postgres** through Prisma 6 |
| Media | **Cloudflare R2** bucket `parliament-festival-media` through `src/lib/storage.ts` (private; signed URLs) |
| Static assets | `public/` (served by the app). Email images and fonts are in `public/assets/` |
| Background work | Railway service `gov-festival-cron` POSTs `/api/internal/tick` every 60 s |
| CI/CD | GitHub Actions CI (`.github/workflows/ci.yml`); Railway autodeploys `phase-0-foundation` |

Design specs for each remediation phase are in `docs/designs/`.

## Local development

1. Install dependencies. This also runs `prisma generate`.

   ```sh
   npm install
   ```

2. Start a local Postgres. Use either option:
   - **Option A:** Prisma's built-in server: `npx prisma dev -n pf -d`. It prints the TCP URL. Append `&pgbouncer=true&connection_limit=1` to that URL.
   - **Option B:** Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17`

3. Set `DATABASE_URL` and `DIRECT_URL` to that URL in `.env`. Set `APP_ENV=local`, `EMAIL_PROVIDER=mock` and `SMS_PROVIDER=mock`. Other variables are listed under **Required configuration** below.

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

`npm run build` produces the production build that Railway runs.

## Database migrations

- Create a migration with `npx prisma migrate dev --create-only --name <name>`, then review the SQL before committing.
- `prisma/migrations/20261105000100_partial_unique_indexes` holds indexes that Prisma cannot model. **Never accept a generated migration that drops `uq_*` indexes.** CI fails if any is missing.
- Write migrations as expand/contract: add the new column or table first, ship code that uses it, and remove the old one in a later release. This keeps the previous deployment compatible during rollback.

## Deploying

Railway (project **Gov Festival**, environment `production`) deploys `gov-festival-app` automatically on every push to `phase-0-foundation`. The public URL is https://gov.dakyx.com.

Each deploy:

1. Builds with Railpack (`npm ci`, `prisma generate`, `npm run build`).
2. Runs the pre-deploy command `npx prisma migrate deploy`. If it fails, the release stops and the previous deployment keeps serving.
3. Starts `npm start`.

To roll back, redeploy an earlier deployment from the Railway dashboard (or `railway redeploy`). Rollback procedures are in `docs/runbooks/deploy-and-rollback.md`.

### Required configuration

Set on the `gov-festival-app` service with `railway variables --set NAME=value`:

- `APP_ENV` (`production`)
- `DATABASE_URL`, `DIRECT_URL` (`${{Postgres.DATABASE_URL}}`)
- `APP_URL`, `NEXT_PUBLIC_APP_URL` (public https origin, used for links and the CSRF check)
- `APP_ENCRYPTION_KEY` (32 random bytes, base64; keep an offline backup)
- `CRON_SECRET` (32+ random characters; authenticates the background tick)
- `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`
- `SMS_PROVIDER`, `VYNFY_API_KEY`, `VYNFY_SENDER_ID`
- `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, optional `CLOUDFLARE_R2_PUBLIC_BASE_URL`
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY` (optional)

The `gov-festival-cron` service needs `CRON_SECRET` (same value) and `TICK_URL` (`https://<app>/api/internal/tick`).

To create the first administrator in a new environment, run `scripts/create-admin.ts`. `scripts/reissue-invite.ts` prints a new activation link and `scripts/set-password.ts` sets a password directly. Instructions are at the top of each file; run them inside the service with `railway ssh -s gov-festival-app`.

**Never commit secrets.**
