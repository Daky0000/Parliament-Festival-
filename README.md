# Parliament of Ghana — Event & Protocol Platform (v3.0)

Platform for the **2026 Festival of Nine Lessons and Carols**.

## What's in this repo

| Path | Description |
| --- | --- |
| `public/index.html` | The landing page at https://parliament-protocol-platform.pages.dev. It hands visitors to the live platform after 3 seconds (meta refresh) and links to its five destinations. |
| `public/assets/brand.css`, `public/assets/fonts/` | The design system, ported from the DakyXTech v21 brand system: white panels on the `#ECEEF1` canvas, Outfit self-hosted (no Google Fonts request), blue `#2563EB` as the only accent, navy bands with the dot field. |
| `.github/workflows/deploy.yml` | Deploys to Cloudflare Pages on every push to `main`. |
| `wrangler.toml` | Cloudflare Pages config (direct upload, output dir `public`). |

The page is static: there are no Pages Functions, so every address on the site serves it.

## The live platform

The Executive Protocol Platform, Super Admin console, AI provider routing, Mobile Usher
Scanner and VIP Seating Engine are served from the development machine through a Cloudflare
quick tunnel (`*.trycloudflare.com`). Their source is not in this repo (local commit
`d69c4c4`, branch `main`). **A quick tunnel gets a new address every time it restarts**, so
when it changes, replace the old host everywhere in `public/index.html` (eight places,
including the meta refresh) and redeploy.

An earlier version of this repo had a role-based sign-in (Super Admin, Admin, Usher) served by
Pages Functions. It was taken off the live site; the code is in commit `c6bec53` if it is
wanted again.

## Auto-deploy from GitHub

Add these repository secrets (Settings → Secrets and variables → Actions):
`CLOUDFLARE_API_TOKEN` (Pages: Edit permission) and `CLOUDFLARE_ACCOUNT_ID`.
Every push to `main` then deploys automatically.

## Manual deploy

```sh
npm install
npm run deploy
```

Secrets (API keys, SMS/email credentials) must never be committed — use
`wrangler pages secret put` or the Cloudflare dashboard.
