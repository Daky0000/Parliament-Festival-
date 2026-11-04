// Session + password helpers for the Super Admin gate (Web Crypto, runs on Cloudflare).
const enc = new TextEncoder();
export const COOKIE = "pp_admin";
const SESSION_HOURS = 8;

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Stored format: pbkdf2$<iterations>$<salt b64>$<hash b64>
export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = (stored || "").split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(salt), iterations: Number(iter) },
    key,
    256
  );
  return safeEqual(b64u(bits), hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function createSession(env, email) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = b64u(enc.encode(JSON.stringify({ email, exp })));
  const token = `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}

export const clearSession = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(env.SESSION_SECRET, payload))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64(payload)));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    if ((data.email || "").toLowerCase() !== (env.ADMIN_EMAIL || "").toLowerCase()) return null;
    return data;
  } catch {
    return null;
  }
}

// Only allow same-site relative redirects after login.
export function safeNext(next) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next
    : "/super-admin";
}
