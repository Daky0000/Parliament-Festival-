// Server-rendered pages. Styling comes from /assets/brand.css and /assets/app.css
// (the DakyXTech design system, v21); this file only arranges content.
import { ROLE_LABEL, HOME } from "./auth.js";
import { MANAGES } from "./users.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const DEFAULT_CONSOLE = "https://concentration-fantastic-mods-usd.trycloudflare.com";
export const consoleUrl = (env) => (env.ADMIN_CONSOLE_URL || DEFAULT_CONSOLE).replace(/\/+$/, "");

const SECURITY_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export const html = (body, status = 200) => new Response(body, { status, headers: SECURITY_HEADERS });

const MARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5"/><path d="M4.5 10h15"/><path d="M6.5 10v7.5M10 10v7.5M14 10v7.5M17.5 10v7.5"/><path d="M4 20h16"/></svg>`;
const ICON = {
  hall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5"/><path d="M6.5 10v7.5M12 10v7.5M17.5 10v7.5"/><path d="M4 20h16"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 6h4M11 18h2"/></svg>`,
  seat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><path d="M4 11h16v4H4z"/><path d="M6 15v5M18 15v5"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
};

function head(title, extra = "") {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} · Parliament of Ghana</title><meta name="robots" content="noindex"><meta name="theme-color" content="#ECEEF1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/outfit-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/brand.css"><link rel="stylesheet" href="/assets/app.css">${extra}</head>`;
}

const brand = (sub) =>
  `<a class="brand" href="/"><span class="brand-mark" aria-hidden="true">${MARK}</span><span class="brand-name"><b>Parliament of Ghana</b>${sub ? `<span>${esc(sub)}</span>` : ""}</span></a>`;

// ---------------------------------------------------------------- sign in

/** The one sign-in page for every role. Deliberately says nothing about the platform. */
export function loginPage(next, error = "", email = "") {
  return html(
    `${head("Sign in")}<body class="auth-body"><main class="auth-card panel">
<div class="dotfield auth-dots" aria-hidden="true"></div>
<div class="auth-inner">
${brand("")}
<h1>Sign in</h1>
${error ? `<div class="notice danger" role="alert">${esc(error)}</div>` : ""}
<form method="POST" action="/login" novalidate>
<input type="hidden" name="next" value="${esc(next)}">
<label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="username" required value="${esc(email)}" ${email ? "" : "autofocus"}></label>
<label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required ${email ? "autofocus" : ""}></label>
<button class="btn btn-b" type="submit">Sign in <span class="arr">&rarr;</span></button>
</form></div></main></body></html>`,
    error ? 401 : 200
  );
}

// ---------------------------------------------------------------- the signed-in frame

function shell(who, active, title, body) {
  const links = [
    ["super", "/super-admin", "Overview"],
    ["admin", "/admin", who.role === "super" ? "Admin view" : "Overview"],
    ["usher", "/usher", who.role === "usher" ? "My tools" : "Usher view"],
  ].filter(([role]) => (who.role === "super" ? true : who.role === "admin" ? role !== "super" : role === "usher"));
  const nav = links.length > 1
    ? `<nav class="nav app-nav" aria-label="Sections">${links.map(([, href, label]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`
    : `<span class="nav-spacer"></span>`;
  return `${head(title)}<body>
<header class="panel header">
${brand("Event & Protocol Platform")}
${nav}
<div class="header-cta who">
<span class="who-name">${who.role === "super" ? "" : `<b>${esc(who.name)}</b>`}<span class="chip role-${who.role}">${ROLE_LABEL[who.role]}</span></span>
<a class="btn btn-o" href="/logout">Sign out</a>
</div>
</header>
<main id="main" class="app-main">${body}</main>
<footer class="panel foot"><span>© 2026 Parliament of Ghana · Festival of Nine Lessons and Carols</span><span>Signed in as ${esc(who.email)}</span></footer>
<script src="/assets/assistant.js" defer></script>
</body></html>`;
}

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Accra" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const firstName = (n) => String(n || "").split(/\s+/)[0];
// "Good evening, Ama." — the owner has no stored name, so just "Good evening."
const hello = (who) => (who.role === "super" ? `${greeting()}.` : `${greeting()}, ${esc(firstName(who.name))}.`);

export const when = (t) =>
  t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" }) : "Never";

const toolCard = (href, icon, title, text, cta, featured) =>
  `<a class="card${featured ? " featured" : ""}" href="${esc(href)}" target="_blank" rel="noopener"><span class="icon-sq" aria-hidden="true">${ICON[icon]}</span><span class="card-title">${title}</span><p>${text}</p><span class="link">${cta} <span class="arr">&rarr;</span></span></a>`;

function tools(env, role) {
  const base = consoleUrl(env);
  const cards = [toolCard(base + "/", "hall", "Executive protocol", "Invitations, accreditation and the running order for the evening.", "Open platform", true)];
  if (role === "super") cards.push(toolCard(base + "/super-admin", "gear", "Platform console", "AI providers, gateways and the platform's own settings.", "Open console"));
  cards.push(toolCard(base + "/usher", "phone", "Usher scanner", "Check guests in at the door and direct them to their seats.", "Open scanner"));
  cards.push(toolCard(base + "/seating", "seat", "VIP seating", "The seating plan for dignitaries, kept in step with the guest list.", "Open seating"));
  return cards.join("");
}

// ---------------------------------------------------------------- Super Admin and Admin

/** The overview, people and activity for a Super Admin (`who.role === "super"`) or an Admin. */
export function managePage(env, who, users, log, active) {
  const scope = who.role === "super" && active === "/super-admin" ? MANAGES.super : MANAGES.admin;
  const people = users.filter((u) => scope.includes(u.role));
  const day = Date.now() - 24 * 3600 * 1000;
  const admins = users.filter((u) => u.role === "admin");
  const ushers = users.filter((u) => u.role === "usher");
  const activeNow = people.filter((u) => !u.disabled);
  const today = people.filter((u) => u.lastLogin && u.lastLogin > day);
  const tile = (label, value, note) =>
    `<div class="tile"><span class="cap">${label}</span><div><b class="figure">${value}</b><span class="tile-note">${note}</span></div></div>`;
  const tiles = (scope.includes("admin") ? [tile("Admins", admins.length, `${admins.filter((u) => !u.disabled).length} active`)] : [])
    .concat([
      tile("Ushers", ushers.length, `${ushers.filter((u) => !u.disabled).length} active`),
      tile("Active accounts", activeNow.length, `of ${people.length} in total`),
      tile("Signed in today", today.length, "in the last 24 hours"),
    ]);
  if (!scope.includes("admin")) tiles.push(tile("Disabled", people.length - activeNow.length, "cannot sign in"));

  const rows = people.length
    ? people
        .map(
          (u) => `<tr data-email="${esc(u.email)}" data-name="${esc(u.name)}">
<td><b>${esc(u.name)}</b><span class="sub">${esc(u.email)}</span></td>
<td><span class="chip role-${u.role}">${ROLE_LABEL[u.role]}</span></td>
<td>${u.disabled ? '<span class="status off">Disabled</span>' : '<span class="status on">Active</span>'}</td>
<td class="nowrap">${when(u.lastLogin)}</td>
<td><div class="row-actions">
<button class="btn btn-o btn-sm" data-act="reset">Reset password</button>
<button class="btn btn-o btn-sm" data-act="${u.disabled ? "enable" : "disable"}">${u.disabled ? "Enable" : "Disable"}</button>
<button class="btn btn-o btn-sm danger" data-act="delete">Remove</button>
</div></td></tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty">No ${scope.includes("admin") ? "admins or ushers" : "ushers"} yet. Add the first one above.</td></tr>`;

  const visibleLog = log.filter((e) => scope.includes(e.about) || (who.role === "super" && active === "/super-admin")).slice(0, 25);
  const activity = visibleLog.length
    ? `<ul class="ruled activity">${visibleLog.map((e) => `<li><span>${when(e.t)}</span><span>${esc(e.text)} <span class="muted">· ${esc(e.by)}</span></span></li>`).join("")}</ul>`
    : `<p class="muted">Nothing has happened yet. Sign-ins and changes to accounts will appear here.</p>`;

  const roleField = scope.length > 1
    ? `<label class="field"><span>Role</span><select class="input" name="role">${scope.map((r) => `<option value="${r}"${r === "usher" ? " selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select></label>`
    : `<input type="hidden" name="role" value="usher">`;

  const kvMissing = !env.USERS
    ? `<div class="notice danger" role="alert">Account storage is not connected (the USERS KV binding is missing), so admins and ushers cannot be added yet.</div>`
    : "";

  const body = `
<section class="app-hero">
<div class="panel app-hero-copy">
<span class="cap">${who.role === "super" && active === "/super-admin" ? "Super Admin" : "Admin"} · Festival of Nine Lessons and Carols 2026</span>
<h1 class="h2">${hello(who)} <span class="muted">Here is the Festival at a glance.</span></h1>
${kvMissing}
</div>
<div class="grid tiles">${tiles.join("")}</div>
</section>

<section class="panel app-section">
<div class="sec-head"><div><span class="cap">Tools</span><h2 class="h3">The protocol platform</h2></div></div>
<div class="grid cards">${tools(env, who.role === "super" && active === "/super-admin" ? "super" : "admin")}</div>
</section>

<section class="panel app-section" id="people">
<div class="sec-head"><div><span class="cap">User management</span><h2 class="h3">${scope.includes("admin") ? "Admins and ushers" : "Ushers"}</h2></div>
<button class="btn btn-b" type="button" id="addToggle" aria-expanded="false" aria-controls="addForm">Add a person <span class="arr">+</span></button></div>
<form class="add-form" id="addForm" hidden>
<div class="add-grid">
<label class="field"><span>Full name</span><input class="input" name="name" required maxlength="80" autocomplete="off"></label>
<label class="field"><span>Email</span><input class="input" name="email" type="email" required maxlength="120" autocomplete="off"></label>
${roleField}
<label class="field"><span>Password <span class="muted">(leave blank to generate one)</span></span><input class="input" name="password" type="text" minlength="10" maxlength="200" autocomplete="new-password"></label>
</div>
<div class="add-actions"><button class="btn btn-b" type="submit">Create account</button><button class="btn btn-o" type="button" id="addCancel">Cancel</button></div>
</form>
<div id="flash" aria-live="polite"></div>
<div class="table-wrap"><table class="people"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Last sign-in</th><th><span class="skip">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>
</section>

<section class="panel soft app-section">
<div class="sec-head"><div><span class="cap">Activity</span><h2 class="h3">Recent sign-ins and changes</h2></div></div>
${activity}
</section>
<script src="/assets/manage.js" defer></script>`;
  return html(shell(who, active, who.role === "super" && active === "/super-admin" ? "Super Admin" : "Admin", body));
}

// ---------------------------------------------------------------- Usher

export function usherPage(env, who) {
  const base = consoleUrl(env);
  const body = `
<section class="app-hero usher-hero">
<div class="panel app-hero-copy">
<span class="cap">Usher · Festival of Nine Lessons and Carols 2026</span>
<h1 class="h2">${hello(who)} <span class="muted">Your tools for the evening.</span></h1>
<p class="lead">Scan each guest's invitation at the door, then use the seating plan to take them to their seat.</p>
</div>
<div class="band usher-band"><div class="dotfield" aria-hidden="true"></div>
<a class="usher-big" href="${esc(base + "/usher")}" target="_blank" rel="noopener"><span class="icon-sq" aria-hidden="true">${ICON.phone}</span><b>Open usher scanner</b><span>Check guests in at the door</span><span class="arr">&rarr;</span></a>
<a class="usher-big" href="${esc(base + "/seating")}" target="_blank" rel="noopener"><span class="icon-sq" aria-hidden="true">${ICON.seat}</span><b>VIP seating plan</b><span>Find a guest's seat</span><span class="arr">&rarr;</span></a>
</div>
</section>`;
  return html(shell(who, "/usher", "Usher", body));
}

export { HOME };
