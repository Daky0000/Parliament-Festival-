# Parliament of Ghana — Event & Protocol Platform (v3.0)

Platform for the **2026 Festival of Nine Lessons and Carols**.

## What's in this repo

| Path | Description |
| --- | --- |
| `functions/`, `lib/` | Sign-in, the three role areas, user management (`functions/api/users.js`) and the assistant API, deployed to Cloudflare Pages project `parliament-protocol-platform` (https://parliament-protocol-platform.pages.dev). |
| `public/assets/brand.css`, `public/assets/fonts/` | The design system, ported from the DakyXTech v21 brand system (DESIGN-SYSTEM.md in dakyworld): white panels on the `#ECEEF1` canvas, Outfit self-hosted, blue `#2563EB` as the only accent, navy bands with the dot field. Every page — including the `/login` screen rendered by `functions/login.js` — links this one file. |
| `functions/api/agent.js` | Pages Function behind the floating ✨ Protocol Assistant chat (calls Claude). Needs the `ANTHROPIC_API_KEY` secret. |
| `.github/workflows/deploy.yml` | Deploys to Cloudflare Pages on every push to `main`. |
| `wrangler.toml` | Cloudflare Pages config (direct upload, output dir `public`). |

## Not yet in this repo

The main application (Executive Protocol Platform, Super Admin console, AI provider
routing, Mobile Usher Scanner, VIP Seating Engine, Vynfy SMS gateway, Resend email) was
served from a local machine through a Cloudflare quick tunnel
(`*.trycloudflare.com`) and its source is not stored on Cloudflare. It must be pushed
from the original development machine (local git commit `d69c4c4`, branch `main`).

## Sign-in and roles

There is no public page: every address goes to `/login`, one sign-in page for everybody,
which says nothing about who can sign in or what is behind it. After sign-in each person
lands in their own area.

| Role | Lands on | Can |
| --- | --- | --- |
| Super Admin (the owner) | `/super-admin` | everything: overview, add / reset / disable / remove admins and ushers, the admin and usher views, the platform console |
| Admin | `/admin` | overview, add / reset / disable / remove **ushers**, the usher view |
| Usher | `/usher` | the usher scanner and the VIP seating plan |

- The **Super Admin** is one account defined only by Cloudflare secrets (below). It is never
  stored with the others, so nobody signed in to the site can create, change or remove it,
  and no second Super Admin can be created.
- **Admins and ushers** live in the `USERS` KV namespace (bound in `wrangler.toml`), with an
  activity log of sign-ins and changes. Accounts are re-read on every request, so disabling,
  removing or resetting the password of an account signs it out at once.
- Passwords are PBKDF2-SHA256; a generated one is shown once to whoever created or reset it.
- The floating Protocol Assistant is on every signed-in page, and `/api/agent` refuses
  anyone who is not signed in. It needs the `ANTHROPIC_API_KEY` secret.

| Secret | Value |
| --- | --- |
| `ADMIN_EMAIL` | The Super Admin's email address |
| `ADMIN_PASSWORD_HASH` | `pbkdf2$100000$<salt>$<hash>` (PBKDF2-SHA256, base64url) |
| `SESSION_SECRET` | Random 32-byte hex string used to sign the session cookie |
| `ADMIN_CONSOLE_URL` | Optional; base URL of the protocol platform the tool links open (defaults to the tunnel URL) |

To change the Super Admin password, generate a new hash and update the secret:

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
