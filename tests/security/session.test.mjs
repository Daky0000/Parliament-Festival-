import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { validateSession, createSession, IDLE_TTL_MS, sessionCookieName } from "../../src/lib/session.ts";
import { sha256Hex } from "../../src/lib/crypto.ts";
import { request, call, userByEmail, cookieFor, ORIGIN } from "../helpers.mjs";

const events = await import("../../src/app/api/v1/events/route.ts");
const logout = await import("../../src/app/api/auth/logout/route.ts");
const login = await import("../../src/app/api/auth/login/route.ts");

test("expired, idle and revoked sessions are rejected", async () => {
  const user = await userByEmail("protocol@parliament.gh");

  const a = await createSession(user.id, { mfaPending: false });
  await prisma.session.update({ where: { id: a.session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.strictEqual(await validateSession(a.rawToken), null, "expired");

  const b = await createSession(user.id, { mfaPending: false });
  await prisma.session.update({ where: { id: b.session.id }, data: { lastSeenAt: new Date(Date.now() - IDLE_TTL_MS - 1000) } });
  assert.strictEqual(await validateSession(b.rawToken), null, "idle");

  const c = await createSession(user.id, { mfaPending: false });
  await prisma.session.update({ where: { id: c.session.id }, data: { revokedAt: new Date() } });
  assert.strictEqual(await validateSession(c.rawToken), null, "revoked");
});

test("only the hash of the session token is stored", async () => {
  const user = await userByEmail("protocol@parliament.gh");
  const { rawToken, session } = await createSession(user.id, { mfaPending: false });
  assert.strictEqual(session.id, await sha256Hex(rawToken));
  assert.strictEqual(await prisma.session.count({ where: { id: rawToken } }), 0);
});

test("logout revokes the session", async () => {
  const cookie = await cookieFor("protocol@parliament.gh");
  assert.strictEqual((await call(events.GET, request("/api/v1/events", { cookie }))).status, 200);
  await call(logout.POST, request("/api/auth/logout", { method: "POST", cookie }));
  assert.strictEqual((await call(events.GET, request("/api/v1/events", { cookie }))).status, 401);
});

test("suspending a user ends their sessions immediately", async () => {
  const user = await userByEmail("approver@parliament.gh");
  const cookie = await cookieFor("approver@parliament.gh");
  await prisma.user.update({ where: { id: user.id }, data: { status: "suspended" } });
  try {
    assert.strictEqual((await call(events.GET, request("/api/v1/events", { cookie }))).status, 401);
  } finally {
    await prisma.user.update({ where: { id: user.id }, data: { status: "active" } });
  }
});

test("login: wrong password and unknown email give the same answer; success sets an HttpOnly cookie", async () => {
  const body = (email, password) => ({ method: "POST", body: { email, password } });
  const wrong = await call(login.POST, request("/api/auth/login", body("protocol@parliament.gh", "not-the-password")));
  const unknown = await call(login.POST, request("/api/auth/login", body("nobody@parliament.gh", "not-the-password")));
  assert.strictEqual(wrong.status, 401);
  assert.strictEqual(unknown.status, 401);
  assert.deepStrictEqual(wrong.json, unknown.json);

  const ok = await call(login.POST, request("/api/auth/login", body("protocol@parliament.gh", process.env.SEED_PASSWORD)));
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
  const setCookie = ok.res.headers.get("set-cookie") || "";
  assert.match(setCookie, new RegExp(`${sessionCookieName()}=`));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
  assert.ok(ORIGIN);
});

test("login is throttled after repeated failures for one email", async () => {
  const email = `throttle-${Date.now()}@example.org`;
  let last;
  for (let i = 0; i < 6; i++) {
    last = await call(login.POST, request("/api/auth/login", { method: "POST", body: { email, password: "wrong-password" } }));
  }
  assert.strictEqual(last.status, 429);
});
