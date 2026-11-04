// Sessions, passwords and roles (Web Crypto, runs on Cloudflare).
//
// Three roles share one sign-in page:
//   super — the owner. Exactly one account, defined only by the ADMIN_EMAIL /
//           ADMIN_PASSWORD_HASH secrets. It is never stored in KV, so nobody
//           signed in to the site can create, change or remove it.
//   admin — manages ushers and sees the overview. Stored in KV.
//   usher — reaches the usher tools only. Stored in KV.
import { getUser } from "./users.js";

const enc = new TextEncoder();
export const COOKIE = "pp_session";
const SESSION_HOURS = 8;
const ITERATIONS = 100000; // Cloudflare's PBKDF2 ceiling

export const ROLES = ["super", "admin", "usher"];
export const ROLE_LABEL = { super: "Super Admin", admin: "Admin", usher: "Usher" };
export const HOME = { super: "/super-admin", admin: "/admin", usher: "/usher" };
// Which areas each role may open. A higher role can look at a lower role's area.
const AREAS = { super: ["/super-admin", "/admin", "/usher"], admin: ["/admin", "/usher"], usher: ["/usher"] };

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

// Stored format: pbkdf2$<iterations>$<salt b64>$<hash b64>
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64u(salt)}$${b64u(await pbkdf2(password, salt, ITERATIONS))}`;
}

// A well-formed hash that matches nothing, so a failed lookup costs the same as a wrong password.
const DUMMY_HASH = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = (stored || DUMMY_HASH).split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const bits = await pbkdf2(password, fromB64(salt), Number(iter));
  return safeEqual(b64u(bits), hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

const isOwner = (env, email) => !!env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();

/** Checks an email and password against the owner secret, then the stored accounts. */
export async function authenticate(env, email, password) {
  if (isOwner(env, email)) {
    return (await verifyPassword(password, env.ADMIN_PASSWORD_HASH))
      ? { email: env.ADMIN_EMAIL, role: "super", name: "Super Admin" }
      : null;
  }
  const user = env.USERS ? await getUser(env, email) : null;
  const ok = await verifyPassword(password, user?.hash); // always runs, to keep timing even
  if (!ok || !user || user.disabled) return null;
  return { email: user.email, role: user.role, name: user.name, pv: user.pv };
}

export async function createSession(env, who) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = b64u(enc.encode(JSON.stringify({ email: who.email, role: who.role, pv: who.pv || 0, exp })));
  const token = `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export const clearSession = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/**
 * The signed-in person, or null. Stored accounts are re-read on every request,
 * so disabling, removing, demoting or resetting the password of an account
 * ends its sessions at once.
 */
export async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(env.SESSION_SECRET, payload))) return null;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(fromB64(payload)));
  } catch {
    return null;
  }
  if (typeof data.exp !== "number" || data.exp < Date.now() || !ROLES.includes(data.role)) return null;
  if (data.role === "super") {
    return isOwner(env, data.email || "") ? { email: env.ADMIN_EMAIL, role: "super", name: "Super Admin" } : null;
  }
  if (!env.USERS || isOwner(env, data.email || "")) return null;
  const user = await getUser(env, data.email);
  if (!user || user.disabled || user.role !== data.role || (user.pv || 0) !== (data.pv || 0)) return null;
  return { email: user.email, role: user.role, name: user.name };
}

export const canOpen = (role, path) => (AREAS[role] || []).some((a) => path === a || path.startsWith(a + "/"));

/** Where to send someone after sign-in: the page they asked for if their role allows it, else their home. */
export function landingFor(role, next) {
  const ok = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\");
  return ok && canOpen(role, next.split("?")[0]) ? next : HOME[role];
}

/** Middleware body: let the request through only for the given roles. */
export async function guard(context, roles) {
  const { request, env, next } = context;
  const who = await readSession(request, env);
  const url = new URL(request.url);
  if (!who) return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
  if (!roles.includes(who.role)) return Response.redirect(`${url.origin}${HOME[who.role]}`, 302);
  context.data.who = who;
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "no-store");
  out.headers.set("X-Frame-Options", "DENY");
  out.headers.set("Referrer-Policy", "no-referrer");
  return out;
}
