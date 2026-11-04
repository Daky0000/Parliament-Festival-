import { verifyPassword, createSession, readSession, safeNext } from "../lib/auth.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(next, error = "", email = "") {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Super Admin sign in · Parliament of Ghana</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/assets/brand.css">
<style>
body{min-height:100vh}
.auth{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:var(--frame)}
.auth-intro{padding:40px;display:flex;flex-direction:column;justify-content:space-between;gap:40px}
.auth-intro > *{position:relative}
.auth-intro .cap{color:rgba(255,255,255,.72)}
.auth-intro h2 span{color:var(--blue-light)}
.auth-intro p{color:rgba(255,255,255,.72);max-width:44ch;margin-top:16px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:28px}
.tiles div{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:var(--r-card);padding:14px;display:flex;flex-direction:column;gap:2px}
.tiles b{font-weight:500;font-size:15px}.tiles span{font-size:13.5px;color:rgba(255,255,255,.72)}
.auth-panel{display:flex;flex-direction:column;justify-content:space-between;padding:32px}
.auth-form{width:100%;max-width:400px;margin:auto;padding:40px 0}
.auth-form .brand{margin-bottom:28px}
.auth-form h1{font-size:40px;letter-spacing:-.04em}
.auth-form .lead{font-size:16px;margin:8px 0 12px}
.auth-form .notice{margin-top:16px}
.auth-form .btn{width:100%;margin-top:24px;height:48px}
.auth-form .back{display:inline-block;margin-top:18px;font-size:14.5px;color:var(--muted);text-decoration:none}
.auth-form .back:hover{color:var(--ink)}
.auth-foot{display:flex;justify-content:space-between;gap:12px;font-size:13.5px;color:var(--muted)}
@media (max-width:900px){.auth{grid-template-columns:1fr}.auth-intro{display:none}.auth-panel{padding:24px}}
</style></head><body><main class="auth">
<section class="band auth-intro"><div class="dotfield" aria-hidden="true"></div>
<span class="cap">Parliament of Ghana · Protocol Platform</span>
<div><h2>The Festival, behind the scenes. <span>For administrators only.</span></h2>
<p>Manage users, providers and settings for the 2026 Festival of Nine Lessons and Carols.</p>
<div class="tiles"><div><b>Guests</b><span>Invitations and accreditation</span></div><div><b>Seating</b><span>The VIP plan</span></div><div><b>Gateways</b><span>Email, SMS and AI</span></div></div></div>
</section>
<section class="panel auth-panel"><div class="auth-form">
<a class="brand" href="/"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5"/><path d="M4.5 10h15"/><path d="M6.5 10v7.5M10 10v7.5M14 10v7.5M17.5 10v7.5"/><path d="M4 20h16"/></svg></span><span class="brand-name"><b>Parliament of Ghana</b><span>Event &amp; Protocol Platform</span></span></a>
<span class="chip">Super Admin</span>
<h1 style="margin-top:16px">Welcome back</h1>
<p class="lead">Sign in to the Super Admin console.</p>
${error ? `<div class="notice danger" role="alert">${esc(error)}</div>` : ""}
<form method="POST" action="/login">
<input type="hidden" name="next" value="${esc(next)}">
<label class="field"><span>Email</span><input class="input" id="email" name="email" type="email" autocomplete="username" required value="${esc(email)}" autofocus></label>
<label class="field"><span>Password</span><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></label>
<button class="btn btn-b" type="submit">Sign in <span class="arr">&rarr;</span></button></form>
<a class="back" href="/">&larr; Back to the platform</a></div>
<div class="auth-foot"><span>&copy; 2026 Parliament of Ghana</span><span>Sessions last 8 hours</span></div>
</section></main></body></html>`,
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
