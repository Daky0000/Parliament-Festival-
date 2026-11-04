import { verifyPassword, createSession, readSession, safeNext } from "../lib/auth.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(next, error = "", email = "") {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Super Admin Sign In</title><meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0A1830;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;min-height:100vh;display:grid;place-items:center;padding:16px}
.card{background:#0D1C38;border:2px solid #C6A65B;border-radius:16px;width:100%;max-width:400px;padding:36px 28px;box-shadow:0 25px 50px -12px rgba(0,0,0,.7)}
h1{font-family:'Playfair Display',serif;font-size:26px;text-align:center}
.sub{color:#DFCA95;text-align:center;font-size:13px;margin:6px 0 26px}
label{display:block;font-size:13px;font-weight:600;color:#DFCA95;margin:14px 0 6px}
input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(198,166,91,.35);background:#070D18;color:#fff;font:inherit;font-size:15px}
input:focus{outline:none;border-color:#C6A65B}
button{width:100%;margin-top:24px;padding:13px;border:0;border-radius:10px;background:#C6A65B;color:#0A1830;font:inherit;font-weight:700;font-size:15px;cursor:pointer}
button:hover{background:#DFCA95}
.err{background:rgba(200,60,60,.18);color:#FFB4B4;border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:6px}
.back{display:block;text-align:center;margin-top:18px;color:rgba(223,202,149,.75);font-size:13px;text-decoration:none}
</style></head><body><main class="card">
<h1>Super Admin</h1><div class="sub">Parliament of Ghana &bull; Protocol Platform</div>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
<form method="POST" action="/login">
<input type="hidden" name="next" value="${esc(next)}">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required value="${esc(email)}" autofocus>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button></form>
<a class="back" href="/">&larr; Back to platform</a></main></body></html>`,
    {
      status: error ? 401 : 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
      },
    }
  );
}

export async function onRequestGet({ request, env }) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (await readSession(request, env)) return Response.redirect(new URL(next, request.url).toString(), 302);
  return page(next);
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) {
    return page("/super-admin", "Admin sign-in is not configured.");
  }
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const next = safeNext(String(form.get("next") || ""));

  const emailOk = email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
  const passOk = await verifyPassword(password, env.ADMIN_PASSWORD_HASH); // always run to keep timing even
  if (!emailOk || !passOk) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return page(next, "Incorrect email or password.", email);
  }
  return new Response(null, {
    status: 303,
    headers: { Location: next, "Set-Cookie": await createSession(env, env.ADMIN_EMAIL), "Cache-Control": "no-store" },
  });
}
