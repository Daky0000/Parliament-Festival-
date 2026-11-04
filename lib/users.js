// Admin and usher accounts, kept in the USERS KV namespace.
//   user:<email>  → { email, name, role, hash, pv, disabled, createdAt, createdBy, lastLogin }
//   log           → the latest activity, newest first
// The Super Admin is not stored here (see lib/auth.js).

const KEY = (email) => `user:${String(email).trim().toLowerCase()}`;
const LOG_KEY = "log";
const LOG_MAX = 200;

export const MANAGED_ROLES = ["admin", "usher"];
/** Which stored roles each signed-in role may manage. */
export const MANAGES = { super: ["admin", "usher"], admin: ["usher"], usher: [] };

export async function getUser(env, email) {
  if (!email) return null;
  return env.USERS.get(KEY(email), "json");
}

export async function putUser(env, user) {
  await env.USERS.put(KEY(user.email), JSON.stringify(user));
}

export async function deleteUser(env, email) {
  await env.USERS.delete(KEY(email));
}

export async function listUsers(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.USERS.list({ prefix: "user:", cursor });
    const rows = await Promise.all(page.keys.map((k) => env.USERS.get(k.name, "json")));
    out.push(...rows.filter(Boolean));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1));
}

/** Public view of an account: never the hash. */
export const publicUser = ({ hash, pv, ...rest }) => rest;

export async function readLog(env) {
  return (await env.USERS.get(LOG_KEY, "json")) || [];
}

/** Appends an event. `about` is the role of the account it concerns, so admins can be shown only their part. */
export async function logEvent(env, actor, text, about) {
  try {
    const log = await readLog(env);
    log.unshift({ t: Date.now(), by: actor, text, about });
    await env.USERS.put(LOG_KEY, JSON.stringify(log.slice(0, LOG_MAX)));
  } catch (err) {
    console.error("log write failed", err);
  }
}
