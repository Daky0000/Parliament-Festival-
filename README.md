# Parliament of Ghana — Event & Protocol Platform (v3.0)

Platform for the **2026 Festival of Nine Lessons and Carols**.

## What's in this repo

| Path | Description |
| --- | --- |
| `public/index.html` | Landing page deployed to Cloudflare Pages project `parliament-protocol-platform` (https://parliament-protocol-platform.pages.dev). Recovered from production deployment `075ac30f` (2026-11-04). |
| `functions/api/agent.js` | Pages Function behind the floating ✨ Protocol Assistant chat (calls Claude). Needs the `ANTHROPIC_API_KEY` secret. |
| `.github/workflows/deploy.yml` | Deploys to Cloudflare Pages on every push to `main`. |
| `functions/login.js`, `functions/logout.js`, `functions/super-admin/`, `lib/auth.js` | Email + password gate for the Super Admin area. |
| `wrangler.toml` | Cloudflare Pages config (direct upload, output dir `public`). |

## Not yet in this repo

The main application (Executive Protocol Platform, Super Admin console, AI provider
routing, Mobile Usher Scanner, VIP Seating Engine, Vynfy SMS gateway, Resend email) was
served from a local machine through a Cloudflare quick tunnel
(`*.trycloudflare.com`) and its source is not stored on Cloudflare. It must be pushed
from the original development machine (local git commit `d69c4c4`, branch `main`).

## Protocol Assistant (floating chat)

The AI agent is a floating sparkle button (bottom-right) that opens a chat panel.
It posts to `/api/agent`, which calls Claude. Set the key once:

```sh
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name parliament-protocol-platform
```

## Super Admin sign-in

`/super-admin/*` requires an email + password login (`/login`, `/logout`).
Credentials live only in Cloudflare Pages secrets — never in this repo:

| Secret | Value |
| --- | --- |
| `ADMIN_EMAIL` | Admin email address |
| `ADMIN_PASSWORD_HASH` | `pbkdf2$100000$<salt>$<hash>` (PBKDF2-SHA256, base64url) |
| `SESSION_SECRET` | Random 32-byte hex string used to sign the session cookie |
| `ADMIN_CONSOLE_URL` | Optional; where signed-in admins are forwarded (defaults to the tunnel URL) |

To change the password, generate a new hash and update the secret:

```sh
node -e 'const c=require("crypto"),s=c.randomBytes(16),u=b=>b.toString("base64url");console.log(`pbkdf2$100000$${u(s)}$${u(c.pbkdf2Sync(process.argv[1],s,100000,32,"sha256"))}`)' 'NEW_PASSWORD' \
  | npx wrangler pages secret put ADMIN_PASSWORD_HASH --project-name parliament-protocol-platform
```

Sessions last 8 hours (HttpOnly, Secure, SameSite=Strict cookie).

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
