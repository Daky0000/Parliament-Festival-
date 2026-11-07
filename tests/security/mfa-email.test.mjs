// Email code as a fallback for two-step verification.
// See docs/designs/mfa-email-fallback.md §7.
import test from "node:test";
import assert from "node:assert";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/db.ts";
import { createSession, sessionCookieName, validateSession } from "../../src/lib/session.ts";
import { encryptSecret } from "../../src/lib/crypto.ts";
import { generateTotpSecret, hotp, base32Decode, currentStep } from "../../src/lib/totp.ts";
import { issuePasswordReset } from "../../src/lib/auth.ts";
import { request, call } from "../helpers.mjs";

const sendRoute = await import("../../src/app/api/auth/mfa/email/route.ts");
const verifyRoute = await import("../../src/app/api/auth/mfa/verify/route.ts");
const resetRoute = await import("../../src/app/api/auth/reset/route.ts");

const HOUR = 3600 * 1000;

/** An enrolled admin-like user whose last authenticator sign-in was an hour ago. */
async function makeEnrolledUser(overrides = {}) {
  const org = await prisma.organization.findFirstOrThrow();
  const email = `mfa-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.org`;
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email,
      fullName: "Mfa Tester",
      status: "active",
      passwordHash: await bcrypt.hash("old-password-123", 4),
      mfaRequired: true,
      mfaEnabledAt: new Date(Date.now() - 2 * HOUR),
      mfaTotpVerifiedAt: new Date(Date.now() - HOUR),
      passwordChangedAt: new Date(Date.now() - 3 * HOUR),
      ...overrides,
    },
  });
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecretEnc: await encryptSecret(secret, `users.mfaSecretEnc:${user.id}`) },
  });
  return { user, secret };
}

async function pendingCookie(userId, ipHash = "ip-hash-for-test") {
  const { rawToken, session } = await createSession(userId, { mfaPending: true, ipHash });
  return { cookie: `${sessionCookieName()}=${rawToken}`, sessionId: session.id };
}

/** Calls the send route and captures the code the mock provider logs. */
async function sendCode(cookie) {
  const original = console.info;
  let code = null;
  console.info = (msg) => {
    const m = /sign-in code for .*: (\d{6})$/.exec(String(msg));
    if (m) code = m[1];
  };
  try {
    const res = await call(sendRoute.POST, request("/api/auth/mfa/email", { method: "POST", cookie, body: {} }));
    return { ...res, code };
  } finally {
    console.info = original;
  }
}

const verify = (cookie, code, method = "email") =>
  call(verifyRoute.POST, request("/api/auth/mfa/verify", { method: "POST", cookie, body: { code, method } }));

const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

test("a correct email code signs in, rotates the session and keeps ipHash", async () => {
  const { user } = await makeEnrolledUser();
  const { cookie, sessionId } = await pendingCookie(user.id);
  const sent = await sendCode(cookie);
  assert.strictEqual(sent.status, 200, JSON.stringify(sent.json));
  assert.match(sent.json.sentTo, /^m•••@example\.org$/);
  assert.strictEqual(sent.json.expiresInSeconds, 600);
  assert.ok(sent.code);

  const res = await verify(cookie, sent.code);
  assert.strictEqual(res.status, 200, JSON.stringify(res.json));
  const old = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  assert.ok(old.revokedAt, "pending session revoked");
  const raw = res.res.cookies.get(sessionCookieName()).value;
  const fresh = await validateSession(raw);
  assert.ok(fresh && !fresh.mfaPending, "full session issued");
  const row = await prisma.session.findUniqueOrThrow({ where: { id: fresh.id } });
  assert.strictEqual(row.ipHash, "ip-hash-for-test");

  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.strictEqual(after.mfaLastStep, user.mfaLastStep, "TOTP replay state untouched");
  assert.strictEqual(after.mfaTotpVerifiedAt.getTime(), user.mfaTotpVerifiedAt.getTime(), "not counted as an authenticator sign-in");
  assert.strictEqual(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.mfa_email_verified" } }), 1);
});

test("email codes are refused before enrolment and for non-local accounts", async () => {
  const { user: notEnrolled } = await makeEnrolledUser({ mfaEnabledAt: null, mfaTotpVerifiedAt: null });
  const a = await sendCode((await pendingCookie(notEnrolled.id)).cookie);
  assert.strictEqual(a.status, 409);

  const { user: sso } = await makeEnrolledUser({ authProvider: "oidc" });
  const b = await sendCode((await pendingCookie(sso.id)).cookie);
  assert.strictEqual(b.status, 409);
});

test("after a password reset, email codes stay off (even 25 h later) until an authenticator sign-in", async () => {
  const { user, secret } = await makeEnrolledUser();
  const token = await issuePasswordReset(user.id);
  const reset = await call(resetRoute.POST, request("/api/auth/reset", { method: "POST", body: { token, password: "a-brand-new-password" } }));
  assert.strictEqual(reset.status, 200);
  // Pretend the reset was 25 hours ago: a time-based cooldown would have expired.
  await prisma.user.update({ where: { id: user.id }, data: { passwordChangedAt: new Date(Date.now() - 25 * HOUR), mfaTotpVerifiedAt: new Date(Date.now() - 26 * HOUR) } });

  const refused = await sendCode((await pendingCookie(user.id)).cookie);
  assert.strictEqual(refused.status, 403);
  assert.match(refused.json.error, /authenticator app/);

  // One authenticator sign-in re-opens the fallback.
  const totpSession = await pendingCookie(user.id);
  const code = await hotp(base32Decode(secret), currentStep());
  const ok = await verify(totpSession.cookie, code, "totp");
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
  const allowed = await sendCode((await pendingCookie(user.id)).cookie);
  assert.strictEqual(allowed.status, 200, JSON.stringify(allowed.json));
});

test("a new user who activates and then enrols can use email codes", async () => {
  const now = Date.now();
  const { user } = await makeEnrolledUser({
    passwordChangedAt: new Date(now - 2 * 60 * 1000), // activation
    mfaEnabledAt: new Date(now - 60 * 1000), // enrolment, after activation
    mfaTotpVerifiedAt: new Date(now - 60 * 1000),
  });
  const res = await sendCode((await pendingCookie(user.id)).cookie);
  assert.strictEqual(res.status, 200);
});

test("resend within 60 s is refused, and the fourth send in 15 min is throttled", async () => {
  const { user } = await makeEnrolledUser();
  const { cookie, sessionId } = await pendingCookie(user.id);
  assert.strictEqual((await sendCode(cookie)).status, 200);
  assert.strictEqual((await sendCode(cookie)).status, 409, "too soon");

  for (let i = 0; i < 2; i++) {
    await prisma.session.update({ where: { id: sessionId }, data: { emailCodeSentAt: new Date(Date.now() - 61 * 1000) } });
    assert.strictEqual((await sendCode(cookie)).status, 200, `send ${i + 2}`);
  }
  await prisma.session.update({ where: { id: sessionId }, data: { emailCodeSentAt: new Date(Date.now() - 61 * 1000) } });
  assert.strictEqual((await sendCode(cookie)).status, 429, "fourth send");
});

test("two concurrent verifies with the same code: exactly one succeeds", async () => {
  const { user } = await makeEnrolledUser();
  const { cookie } = await pendingCookie(user.id);
  const { code } = await sendCode(cookie);
  const results = await Promise.all([verify(cookie, code), verify(cookie, code)]);
  assert.deepStrictEqual(results.map((r) => r.status).sort(), [200, 401]);
});

test("a code only works on the sign-in that asked for it, once, and before it expires", async () => {
  const { user } = await makeEnrolledUser();
  const a = await pendingCookie(user.id);
  const b = await pendingCookie(user.id);
  const { code } = await sendCode(a.cookie);
  assert.strictEqual((await verify(b.cookie, code)).status, 401, "other session");

  const { user: u2 } = await makeEnrolledUser();
  const c = await pendingCookie(u2.id);
  const sent = await sendCode(c.cookie);
  await prisma.session.update({ where: { id: c.sessionId }, data: { emailCodeExpiresAt: new Date(Date.now() - 1000) } });
  assert.strictEqual((await verify(c.cookie, sent.code)).status, 401, "expired");
});

test("method email with no code sent is a counted failure", async () => {
  const { user } = await makeEnrolledUser();
  const { cookie } = await pendingCookie(user.id);
  const res = await verify(cookie, "123456");
  assert.strictEqual(res.status, 401);
  assert.strictEqual(await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.mfa_failed" } }), 1);
});

test("five mixed wrong codes (email and authenticator) revoke the pending session", async () => {
  const { user } = await makeEnrolledUser();
  const { cookie, sessionId } = await pendingCookie(user.id);
  const { code } = await sendCode(cookie);
  for (let i = 0; i < 5; i++) {
    const res = await verify(cookie, wrong(code), i % 2 ? "totp" : "email");
    assert.strictEqual(res.status, 401);
  }
  const row = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  assert.ok(row.revokedAt, "pending session revoked");
  assert.strictEqual((await verify(cookie, code)).status, 401, "correct code no longer helps");
});

test("a deployed site with the mock email provider refuses to send and stores no code", async () => {
  const { user } = await makeEnrolledUser();
  const { rawToken, session } = await createSession(user.id, { mfaPending: true });
  const sessionId = session.id;
  const prev = { env: process.env.APP_ENV, url: process.env.APP_URL };
  process.env.APP_ENV = "staging";
  process.env.APP_URL = "https://staging.example.invalid";
  try {
    const res = await call(
      sendRoute.POST,
      new (await import("next/server")).NextRequest("https://staging.example.invalid/api/auth/mfa/email", {
        method: "POST",
        // Deployed environments use a different cookie name, so build it after switching.
        headers: { cookie: `${sessionCookieName()}=${rawToken}`, origin: "https://staging.example.invalid", "content-type": "application/json" },
        body: "{}",
      })
    );
    assert.strictEqual(res.status, 502, JSON.stringify(res.json));
  } finally {
    process.env.APP_ENV = prev.env;
    process.env.APP_URL = prev.url;
  }
  const row = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  assert.strictEqual(row.emailCodeHash, null);
  assert.strictEqual(row.emailCodeSentAt, null);
});
