# Phase 0: Foundation, Hygiene and Infrastructure

| | |
|---|---|
| **Status** | Approved by owner 2026-11-05 ("implement and complete all phases"). Review resolutions in §11 supersede earlier sections. |
| **Owner** | Daky0000 |
| **Date** | 2026-11-05 |
| **Roadmap** | `C:\Users\ASUS\.claude\plans\cryptic-stirring-platypus.md` (Phase 0 of 8) |
| **Source spec** | Parliament Festival remediation and usher check-in specification, §3.9, §3.10, §20, §22 Phase 0 |

## 1. Purpose

Establish a production-grade base before any feature or security work begins:

- a real hosted environment;
- a real database with versioned migrations;
- CI that fails when it should.

Phase 0 changes **no user-facing behaviour**. Auth fixes start in Phase 1, so the staging deployment in this phase must not be publicly reachable (see §6.4).

## 2. Current state (audited 2026-11-05)

| Area | Finding | Evidence |
|---|---|---|
| Hosting | The app runs on a developer laptop behind a temporary Cloudflare quick tunnel. | `cloudflared.exe`, `configure_tunnel.mjs`, `create_tunnel.mjs`, `tunnel*.log` |
| Deploy | CI publishes only a static page that redirects to the tunnel URL. | `.github/workflows/deploy.yml`, `cloudflare-pages-portal/index.html` |
| Database | SQLite, `prisma db push`, no migrations folder. | `prisma/schema.prisma:2` |
| Postgres draft | There is an unused hand-written SQL file that contains partial unique indexes. | `prisma/postgresql_schema.sql` |
| Tests | The glob `tests/**/*.test.js` matches nothing (all tests are `.mjs`), and `\|\| echo` hides failures. | `package.json` `test` script |
| Lint | `next lint` was removed in Next 16. | `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:1096` |
| Typecheck | No script. | `package.json` |
| Secrets in repo history | `.env` containing `JWT_SECRET`, `GEMINI_API_KEY` and `POSTMARK_SERVER_TOKEN` | commits `7d77d30`, `d69c4c4` (deleted in `3802eab`) |
| Secrets on disk | Cloudflare account ID and API token are hardcoded (untracked, gitignored). | `configure_tunnel.mjs`, `create_tunnel.mjs` |
| Remotes | `origin` is `Daky0000/Gov-Festival`. `parliament` is `Daky0000/Parliament-Festival-`. `parliament/main` is at the same commit as local `master` (`0e66651`). | `git remote -v` |

## 3. Goals

1. The full Next.js app runs on Cloudflare Workers through `@opennextjs/cloudflare`.
2. The database is Neon Postgres, with versioned Prisma migrations, and dev, staging and prod are separate Neon branches.
3. CI is the only way to deploy and runs lint, typecheck, tests and build as required gates.
4. The tunnel and the static portal are gone.
5. Leaked credentials are rotated.
6. Rollback is documented and has been rehearsed once.

## 4. Non-goals

- Any auth, authz, comms, seating or check-in fix. Those are Phases 1 to 4.
- Queues, Cron Triggers and R2 wiring. These bindings are declared in this phase but first used in Phase 3 and Phase 5.
- A custom production domain. Staging uses `*.workers.dev`; the domain is needed by Phase 8.

## 5. Decisions

### D1. Runtime: Cloudflare Workers via OpenNext

- **Chosen because:** the user picked Cloudflare for everything except the database. OpenNext is the maintained Workers adapter. The Next 16 docs list Cloudflare Workers, KV and R2 as supported building blocks (`deploying-to-platforms.md:59`).
- **Config:**
  - `wrangler.jsonc` replaces `wrangler.toml`.
  - Settings: `main: .open-next/worker.js`, `compatibility_flags: ["nodejs_compat"]`, assets binding.
  - Environments: `staging` and `production`.
  - `open-next.config.ts` uses the defaults.
- **Risk:** OpenNext support for Next 16.4 is unverified. This is mitigated by the spike in §7. If the spike fails, Phase 0 stops and the hosting decision goes back to the user. There is no silent fallback.

### D2. Database: Neon Postgres + Prisma 6 driver adapter

- **Packages:** `@prisma/adapter-neon` and `@neondatabase/serverless`. The `driverAdapters` preview feature is enabled if Prisma 6.4 still requires it (check the release notes at implementation time).
- **Client:** `src/lib/prisma.ts` creates the client per request on Workers. A module-global client is unsafe across requests in Workers. The connection string comes from the `DATABASE_URL` secret.
- **Connection strings:**
  - Migrations use the **direct** (non-pooled) URL, `DIRECT_URL`.
  - The runtime uses the **pooled** URL.
- **Neon branches:**
  - `main` serves prod.
  - `staging` is branched from main.
  - Per-PR CI branches are created and then deleted.
  - Local dev uses its own `dev` branch.

### D3. Migration strategy

1. Change `provider` to `postgresql`.
2. Fix types SQLite tolerated:
   - `String` fields that hold JSON stay `String` for now; converting them to `Json` is deferred to Phase 2.
   - Check `DateTime` defaults.
   - Check `@db` annotations.
3. Run `prisma migrate dev --name init` against an empty Neon dev branch to create `prisma/migrations/0001_init`.
4. Port the partial unique indexes from `prisma/postgresql_schema.sql` into a hand-edited migration `0002_partial_indexes`:
   - `uq_one_active_checkin_per_guest`
   - the seat-assignment indexes
   - The indexes are added in this phase and code begins relying on them in Phase 2.
   - **Pre-check:** each index must be valid against the seeded data.
5. Delete `prisma/postgresql_schema.sql` after porting, since the migrations become the single source of truth.
6. Seeds:
   - `prisma/seed.ts` runs unchanged against Postgres.
   - `create_demo_token.ts` (hardcoded `"demo-vip-token"`) is restricted to non-production: it refuses when `APP_ENV=production`.
7. **Data:** there is no production data to migrate, because SQLite `dev.db` is local demo data. **Open question Q1.**

### D4. Scripts and CI

`package.json`:

```json
"lint": "eslint .",
"typecheck": "tsc --noEmit",
"test": "node --import tsx --test \"tests/**/*.test.mjs\"",
"test:unit": "node --import tsx --test \"tests/unit/**/*.test.mjs\"",
"db:migrate": "prisma migrate deploy",
"build:worker": "opennextjs-cloudflare build",
"preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
"deploy:staging": "opennextjs-cloudflare build && opennextjs-cloudflare deploy --env staging"
```

- **ESLint:** `eslint.config.mjs` with flat config and `eslint-config-next@16`, per the Next 16 migration guide.
- **Removed scripts:** `pages:dev`, `pages:deploy` and `prisma:push`.
- **Existing failures:** the `test` script currently passes only by matching nothing, so the real tests may fail when first run. Phase 0 records each failure. A failure is either fixed (when it is a test-harness issue) or marked `todo` with a linked Phase number. **No test is deleted to make CI green.**

`.github/workflows/ci.yml` runs on PRs and pushes to `main`. Its jobs:

1. `lint`, `typecheck`, `test:unit`.
2. `integration`:
   - Create a Neon branch `ci-<run_id>` via `neondatabase/create-branch-action`.
   - Run `prisma migrate deploy`, then the seed, then `npm test`.
   - Delete the branch, always (even on failure).
3. `build`: run `build:worker`.
4. `secrets-scan`: gitleaks over the diff, plus a full-history baseline report.
5. `audit`: `npm audit --audit-level=high`. This job is non-blocking in Phase 0 and becomes blocking in Phase 8.

`.github/workflows/deploy.yml` replaces the existing file:

- **staging:** runs on push to `main` after CI passes. Runs `prisma migrate deploy` against Neon staging, then `deploy --env staging`.
- **production:** `workflow_dispatch` only, with a GitHub Environment `production` that requires reviewer approval. Runs migrate deploy, then deploy, then a smoke check against `/api/health`.
- **Rollback:** `wrangler rollback --env production` restores the code. Database rollback uses Neon point-in-time restore to a new branch. Migrations are written expand/contract, so the previous code version stays compatible.

### D5. Health endpoint

Add `GET /api/health`:

- It runs a DB ping (`SELECT 1`) and returns `{status, version}`, where `version` is the git SHA injected at build time.
- It returns no secrets and no counts.
- It is unauthenticated: it is the only new public route.

### D6. Secrets

- Runtime secrets are set with `wrangler secret put` per environment. They are never written to files.
- Local dev uses `.dev.vars`, which is gitignored. A committed `.dev.vars.example` lists the variable names only.
- CI secrets are stored in GitHub Actions secrets:
  - `CLOUDFLARE_API_TOKEN`, scoped to Workers Scripts:Edit plus Account Settings:Read
  - `CLOUDFLARE_ACCOUNT_ID`
  - `NEON_API_KEY`
  - `NEON_PROJECT_ID`
  - `DATABASE_URL_STAGING` and `DIRECT_URL_STAGING`
  - the same pair for production
- `src/lib/env-manager.ts` keeps working locally in Phase 0, but **must not run on Workers**: the filesystem is read-only, so its call path would throw. Phase 0 guards it with an `APP_ENV !== 'local'` → 501 response on the `integrations/[providerKey]` PATCH. Phase 1 deletes it.

### D7. Removal list

| Item | Action |
|---|---|
| `cloudflared.exe` (untracked) | Delete. |
| `cloudflared*.log`, `tunnel*.log` (untracked) | Delete. |
| `configure_tunnel.mjs`, `create_tunnel.mjs` (untracked, contain a token) | Delete after the token is revoked. |
| `cloudflare-pages-portal/` | Delete. |
| `src/app/api/v1/super-admin/cloudflare/tunnel/route.ts` | Delete. |
| `src/app/super-admin/cloudflare` page (tunnel UI) | Delete. Remove its nav link. |
| Pages-specific `wrangler.toml` | Replace with `wrangler.jsonc`. |
| `.gitignore` | Add `.dev.vars`, `.open-next/`, `.wrangler/`. |

## 6. Security handling in Phase 0

### 6.1 Credential rotation (user actions; blocking)

| Credential | Where exposed | Action |
|---|---|---|
| Neon API key | Pasted in an AI chat transcript (2026-11-05) | Revoke and create a new key in the Neon console. |
| Cloudflare API token | Plaintext in the tunnel scripts | Revoke. Create a scoped CI token. |
| `JWT_SECRET`, `GEMINI_API_KEY`, `POSTMARK_SERVER_TOKEN` | git history, pushed to two GitHub remotes | Revoke at each provider. `JWT_SECRET` is unused by current code, so retire it. |

A history rewrite (`git filter-repo`) is **not** a substitute for rotation. A rewrite is optional and is decision **Q2**.

### 6.2 Remote and branch

- Authoritative remote: `parliament` (`Daky0000/Parliament-Festival-`), branch `main`. `origin` (`Gov-Festival`) is either archived or kept as a mirror (**Q3**).
- `main` gets branch protection with the following rules:
  - require PR + CI green;
  - no force push;
  - production environment approval.

### 6.3 Neon database access

- Use separate roles per environment. The app role has no `CREATEDB` privilege.
- `sslmode=require` is set on all connection strings.

### 6.4 Staging exposure

The app has no real authentication until Phase 1. To keep staging private, it sits behind **Cloudflare Access** (Zero Trust, free tier), which allows only the owner's email. Production deploys of Phase 0 are allowed, because the user requires a deploy after each phase. However, the production Worker also stays behind Access until the Phase 1 exit gate passes.

## 7. Spike (first implementation task; gates everything else)

The spike lives on a throwaway branch `spike/opennext-neon`. It must prove each of the following:

1. `opennextjs-cloudflare build` succeeds for Next 16.4.5 with this app.
2. `wrangler dev` / `preview` serves `/` and one dashboard page.
3. A Prisma query through the Neon adapter returns rows inside the Worker.
4. `bcrypt.compare` (bcryptjs, cost 10) completes within the Workers CPU limit, with timing measured. If it is slow, record the result; Phase 1 decides between lowering the cost and switching to scrypt from `node:crypto`.
5. The `qrcode` and `xlsx` imports bundle without errors.

| Outcome | Next step |
|---|---|
| All 5 pass | Proceed. |
| (1), (2) or (3) fails | Stop and report to the user with the error output. |
| (4) or (5) fails | Record as a Phase 1 / Phase 2 item and proceed. |

## 8. Acceptance criteria

- [ ] **AC1:** All §6.1 rotations are confirmed by the user.
- [ ] **AC2:** All 5 spike checks are recorded in `docs/designs/phase-0-spike-results.md`.
- [ ] **AC3:** `prisma/schema.prisma` uses `postgresql`. `prisma/migrations/` contains the init and partial-index migrations. `prisma migrate deploy` succeeds on a fresh Neon branch, and the seed runs.
- [ ] **AC4:** `npm run lint`, `typecheck` and `test` exit non-zero on an injected failure (each verified once with a deliberately broken commit on a scratch branch).
- [ ] **AC5:** CI runs all jobs on a PR. The integration job creates and deletes its Neon branch.
- [ ] **AC6:** A merge to `main` deploys staging automatically. Staging `/api/health` returns `ok` with the matching SHA, behind Access.
- [ ] **AC7:** A production deploy requires approval and passes the health smoke check.
- [ ] **AC8:** A rollback has been rehearsed once on staging (`wrangler rollback`) and the steps are documented in `docs/runbooks/deploy-and-rollback.md`.
- [ ] **AC9:** Every item in the §5 D7 removal list is gone. `grep -r trycloudflare` returns nothing.
- [ ] **AC10:** gitleaks on the current tree is clean. The history findings are documented as rotated.
- [ ] **AC11:** No user-facing behaviour has changed, apart from removal of the tunnel page.

## 9. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Is there any real data in the local SQLite `dev.db` that must be kept? | No; reseed. |
| Q2 | Rewrite git history to purge `.env`? Rewriting changes every SHA and needs a force push to both remotes. | No rewrite; rotate only. |
| Q3 | What happens to the `origin` (`Gov-Festival`) remote: archive, mirror, or delete? | Archive. |
| Q4 | Which email(s) are allowed through Cloudflare Access for staging and pre-Phase-1 production? | `dakyayipah@gmail.com` |
| Q5 | Neon region? | `aws-eu-central-1` (closest major region to Ghana; confirm with the Neon region list). |

## 10. Risks

| Risk | Mitigation |
|---|---|
| OpenNext does not support Next 16.4 | Spike first. Stop and escalate on failure. |
| Prisma on Workers: bundle size, cold start | Measure in the spike. Prisma 6 driver adapters are designed for this. |
| Worker CPU limit with bcrypt | Measure in the spike. Decide in Phase 1. |
| Existing tests fail once they actually run | Triage each one; never delete a test. |
| SQLite→Postgres type differences | Run the init migration and the seed on a fresh branch before merging. |

## 11. Review resolution log (EGM goldfish review, 2026-11-05)

The design, readiness, comprehension and structural reviewers worked from zero context. The table below records how their findings were resolved. Where this table differs from §1–§10, this table wins.

| Finding | Resolution |
|---|---|
| Email assets live in `cloudflare-pages-portal/` (readiness B3) | Moved to `public/assets/`. Templates use the `{{app.asset_base}}` placeholder, filled from `NEXT_PUBLIC_APP_URL` (`src/lib/app-url.ts`). Templates already stored in the database must be refreshed with `prisma/upgrade_invitation_template.ts`. |
| Tests need a seeded database; `test:unit` cannot run alone (B1/B2) | There is no separate unit job. CI runs one test job against a **Postgres service container**: migrate, check indexes, seed, then `npm test --test-concurrency=1`. |
| CI branches cloned from the Neon prod branch would copy PII (design M10) | Neon is used only for staging and prod. No CI branches are created. |
| Wrong client file named; per-request Prisma client undefined (B2/M1) | `src/lib/db.ts` keeps the `prisma` export as a lazy proxy. On Workers it builds a `PrismaNeon` client per request through React `cache()`; on Node it uses one TCP client. The 35 call sites are unchanged. `directUrl` was added. |
| Partial index SQL used snake_case columns (B1/M1) | Rewritten against the real camelCase columns in `prisma/migrations/20261105000100_partial_unique_indexes`. `scripts/check-indexes.ts` runs in CI after every migrate. |
| `postgresql_schema.sql` holds about 37 CHECK constraints (M12) | Archived at `docs/designs/reference/legacy-postgresql-schema.sql`. The CHECK constraints are ported in **Phase 2**. |
| Postgres `contains` is case-sensitive (M11) | `mode: "insensitive"` added to guest search, check-in search and the AI search tool. |
| Seed hardcodes the password `Parliament2026!` (M6) | Seeds read `SEED_PASSWORD` (12+ characters). All seed scripts refuse when `APP_ENV` is unset or `production`. The first production admin is created in Phase 1. |
| Health check sits behind Access (B4/M4) | The smoke test sends an Access service token (`CF_ACCESS_CLIENT_ID` / `_SECRET`) and asserts both `status:"ok"` and the SHA. `preview_urls: false` is set on every environment (M5). |
| No artifact promotion; concurrency; deploy after migrate (M7/M8) | Production deploys a SHA that is on `main` and already green on staging. It is rebuilt with prod vars because `NEXT_PUBLIC_APP_URL` is inlined at build time. Each environment has a `concurrency` group. A failed smoke test triggers an automatic `wrangler rollback`. |
| DB rollback not designed (M9) | The procedure is in `docs/runbooks/deploy-and-rollback.md`. Rehearsal is tracked in the runbook's log table. |
| Env-manager guard mis-scoped (M13) | Only `rotate_secret` / `update_key` returns 501, checked before any database write, when `APP_ENV !== "local"`. The toggle path is unchanged. |
| `APP_ENV` undefined (M5) | Values: `local`, `ci`, `staging`, `production`. Set in `wrangler.jsonc` `vars` per environment, in the CI job env, and locally in `.env`. Staging forces `EMAIL_PROVIDER=mock` and `SMS_PROVIDER=mock`. |
| Tests reached the real Resend API (found while implementing) | `tests/setup.mjs` blanks every provider key and forces mock providers before any test file loads. |
| Lint/typecheck baseline (M8) | `tsc` is clean. ESLint: `no-explicit-any` is set to `warn` until Phase 8; the other errors were fixed. |
| Gitleaks history (nit 7) | The action scans only the commits in each push or PR, so it blocks new leaks. The leaked values in history are rotated by the owner. |
| Cloudflare plan (M3) | **Workers Paid** is required: the bundle exceeds the 3 MiB Free limit, bcrypt exceeds the 10 ms CPU limit, and Queues need Paid. This is an owner action. |
| OpenNext on Windows | `opennextjs-cloudflare build` fails on Windows with a symlink `EPERM` error. The Next build itself succeeds. The Worker bundle is built and measured in Linux CI. |
