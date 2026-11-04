# Parliament of Ghana — Event & Protocol Platform (v3.0)

Platform for the **2026 Festival of Nine Lessons and Carols**.

## What's in this repo

| Path | Description |
| --- | --- |
| `public/index.html` | Landing page deployed to Cloudflare Pages project `parliament-protocol-platform` (https://parliament-protocol-platform.pages.dev). Recovered from production deployment `075ac30f` (2026-11-04). |
| `wrangler.toml` | Cloudflare Pages config (direct upload, output dir `public`). |

## Not yet in this repo

The main application (Executive Protocol Platform, Super Admin console, AI provider
routing, Mobile Usher Scanner, VIP Seating Engine, Vynfy SMS gateway, Resend email) was
served from a local machine through a Cloudflare quick tunnel
(`*.trycloudflare.com`) and its source is not stored on Cloudflare. It must be pushed
from the original development machine (local git commit `d69c4c4`, branch `main`).

## Deploy

```sh
npx wrangler pages deploy public --project-name parliament-protocol-platform
```

Secrets (API keys, SMS/email credentials) must never be committed — use
`wrangler pages secret put` or the Cloudflare dashboard.
