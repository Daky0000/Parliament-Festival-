// User management. POST { action, ... } as JSON.
//   create  { name, email, role, password? }
//   reset   { email }            → a new generated password, shown once
//   disable { email } / enable { email } / delete { email }
// A Super Admin manages admins and ushers; an Admin manages ushers only.
// The Super Admin account itself is not stored here and cannot be touched.
import { readSession, hashPassword, ROLE_LABEL } from "../../lib/auth.js";
import { getUser, putUser, deleteUser, logEvent, publicUser, MANAGES } from "../../lib/users.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("").replace(/(.{4})(.{5})(.{5})/, "$1-$2-$3");
}

export async function onRequestPost({ request, env }) {
  const who = await readSession(request, env);
  if (!who) return json({ error: "Your session has ended. Sign in again." }, 401);
  const allowed = MANAGES[who.role] || [];
  if (!allowed.length) return json({ error: "You do not have permission to manage accounts." }, 403);
  if (!env.USERS) return json({ error: "Account storage is not connected." }, 503);

  // Same-origin JSON only: with SameSite=Strict cookies this closes off cross-site requests.
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-site request refused." }, 403);
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return json({ error: "Expected JSON." }, 415);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const action = String(body.action || "");
  const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
  if (!EMAIL.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (env.ADMIN_EMAIL && email === env.ADMIN_EMAIL.toLowerCase()) return json({ error: "That account cannot be managed here." }, 403);

  if (action === "create") {
    const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const role = String(body.role || "");
    if (!name) return json({ error: "Enter the person's name." }, 400);
    if (!allowed.includes(role)) return json({ error: `You cannot create ${ROLE_LABEL[role] || "that"} accounts.` }, 403);
    if (await getUser(env, email)) return json({ error: "An account with that email already exists." }, 409);
    const given = String(body.password || "");
    if (given && given.length < 10) return json({ error: "Passwords need at least 10 characters." }, 400);
    const password = given || generatePassword();
    const user = { email, name, role, hash: await hashPassword(password), pv: 0, disabled: false, createdAt: Date.now(), createdBy: who.email, lastLogin: null };
    await putUser(env, user);
    await logEvent(env, who.name, `${ROLE_LABEL[role]} account created for ${name}`, role);
    return json({ ok: true, user: publicUser(user), password: given ? null : password });
  }

  const user = await getUser(env, email);
  if (!user) return json({ error: "No account with that email." }, 404);
  if (!allowed.includes(user.role)) return json({ error: "You cannot manage that account." }, 403);

  if (action === "reset") {
    const password = generatePassword();
    await putUser(env, { ...user, hash: await hashPassword(password), pv: (user.pv || 0) + 1 });
    await logEvent(env, who.name, `Password reset for ${user.name}`, user.role);
    return json({ ok: true, password });
  }
  if (action === "disable" || action === "enable") {
    await putUser(env, { ...user, disabled: action === "disable" });
    await logEvent(env, who.name, `${user.name} ${action === "disable" ? "disabled" : "enabled"}`, user.role);
    return json({ ok: true });
  }
  if (action === "delete") {
    await deleteUser(env, email);
    await logEvent(env, who.name, `${ROLE_LABEL[user.role]} account removed: ${user.name}`, user.role);
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
}
