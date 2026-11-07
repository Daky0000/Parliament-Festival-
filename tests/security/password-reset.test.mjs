import test from "node:test";
import assert from "node:assert";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/db.ts";
import { issueInvite, issuePasswordReset, consumeInvite } from "../../src/lib/auth.ts";
import { createSession, validateSession } from "../../src/lib/session.ts";
import { request, call } from "../helpers.mjs";

const forgot = await import("../../src/app/api/auth/forgot/route.ts");
const reset = await import("../../src/app/api/auth/reset/route.ts");

async function makeUser(status) {
  const org = await prisma.organization.findFirstOrThrow();
  const email = `reset-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.org`;
  return prisma.user.create({
    data: { organizationId: org.id, email, fullName: "Reset Tester", status, passwordHash: await bcrypt.hash("old-password-123", 4) },
  });
}

test("forgot answers the same for known and unknown emails", async () => {
  const user = await makeUser("active");
  const known = await call(forgot.POST, request("/api/auth/forgot", { method: "POST", body: { email: user.email } }));
  const unknown = await call(forgot.POST, request("/api/auth/forgot", { method: "POST", body: { email: "nobody-here@example.org" } }));
  assert.strictEqual(known.status, 200);
  assert.deepStrictEqual(known.json, unknown.json);
  assert.strictEqual(await prisma.userInvite.count({ where: { userId: user.id, purpose: "password_reset", usedAt: null } }), 1);
});

test("a reset link changes the password once and signs out every session", async () => {
  const user = await makeUser("active");
  const { rawToken: sessionToken } = await createSession(user.id, { mfaPending: false });
  const token = await issuePasswordReset(user.id);

  const weak = await call(reset.POST, request("/api/auth/reset", { method: "POST", body: { token, password: "short" } }));
  assert.strictEqual(weak.status, 400, "weak password rejected without burning the token");

  const ok = await call(reset.POST, request("/api/auth/reset", { method: "POST", body: { token, password: "a-brand-new-password" } }));
  assert.strictEqual(ok.status, 200);
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(await bcrypt.compare("a-brand-new-password", updated.passwordHash));
  assert.strictEqual(await validateSession(sessionToken), null, "old session revoked");

  const again = await call(reset.POST, request("/api/auth/reset", { method: "POST", body: { token, password: "another-new-password" } }));
  assert.strictEqual(again.status, 400, "token is single-use");
});

test("reset and invite tokens cannot be swapped", async () => {
  const invited = await makeUser("invited");
  const inviteToken = await issueInvite(invited.id, null);
  const viaReset = await call(reset.POST, request("/api/auth/reset", { method: "POST", body: { token: inviteToken, password: "a-brand-new-password" } }));
  assert.strictEqual(viaReset.status, 400, "invite token is not a reset token");

  const active = await makeUser("active");
  const resetToken = await issuePasswordReset(active.id);
  assert.strictEqual(await consumeInvite(resetToken), null, "reset token is not an invite");
});

test("expired reset links are refused", async () => {
  const user = await makeUser("active");
  const token = await issuePasswordReset(user.id);
  await prisma.userInvite.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const res = await call(reset.POST, request("/api/auth/reset", { method: "POST", body: { token, password: "a-brand-new-password" } }));
  assert.strictEqual(res.status, 400);
});
