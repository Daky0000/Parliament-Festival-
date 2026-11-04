# Parliament of Ghana — Event & Protocol Platform (v3.0)

Platform for the **2026 Festival of Nine Lessons and Carols**.

This repo holds both parts of the project:

1. **The platform**, a Next.js app: the Executive Protocol Platform, Super Admin console, AI provider routing, Mobile Usher Scanner and VIP Seating Engine.
2. **The landing page**, a static Cloudflare Pages site at https://parliament-protocol-platform.pages.dev.

## What's in this repo

| Path | Description |
| --- | --- |
| `src/` | Next.js app (App Router): dashboard, Super Admin console, usher scanner, `/api/v1` routes. |
| `prisma/` | Database schema, seed scripts. |
| `tests/` | Unit and end-to-end tests. |
| `cloudflare-pages-portal/index.html` | Landing page. It sends visitors to the live platform after 3 seconds (meta refresh) and links to its five destinations. |
| `cloudflare-pages-portal/assets/` | Design system ported from the DakyXTech v21 brand system: white panels on the `#ECEEF1` canvas, self-hosted Outfit font (no Google Fonts request), blue `#2563EB` as the only accent, navy bands with the dot field. |
| `.github/workflows/deploy.yml` | Deploys the landing page to Cloudflare Pages on every push to `main`. |
| `wrangler.toml` | Cloudflare Pages config (direct upload, output dir `cloudflare-pages-portal`). |

## Running the platform

```sh
npm install
npm run prisma:generate
npm run dev
```

## The live platform

The platform is served from the development machine through a Cloudflare quick tunnel
(`*.trycloudflare.com`). **A quick tunnel gets a new address every time it restarts.** When the address changes,
replace the old host everywhere in `cloudflare-pages-portal/index.html` (eight places,
including the meta refresh) and redeploy.

An earlier version of the landing site had a role-based sign-in (Super Admin, Admin, Usher)
served by Pages Functions. It was taken off the live site. The code is in commit `c6bec53` if you need it again.

## Landing page deploy

Automatic: add the repository secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit permission) and
`CLOUDFLARE_ACCOUNT_ID` (Settings → Secrets and variables → Actions). After that, every push to `main` deploys.

Manual:

```sh
npm install
npm run pages:deploy
```

Local preview: `npm run pages:dev`.

Never commit secrets (API keys, SMS/email credentials). Store them with
`wrangler pages secret put` or in the Cloudflare dashboard.
