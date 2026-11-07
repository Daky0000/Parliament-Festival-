import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { actorFromSession, can } from "../../src/lib/authz.ts";
import { SYSTEM_ROLES } from "../../src/lib/roles.ts";
import { executeAiTool } from "../../src/lib/ai/orchestrator.ts";
import { createSession } from "../../src/lib/session.ts";

async function actorFor(email) {
  const user = await prisma.user.findFirstOrThrow({ where: { email } });
  const { session } = await createSession(user.id, { mfaPending: false });
  return actorFromSession(session);
}

test("RBAC: roles grant exactly their mapped permissions", async () => {
  const event = await prisma.event.findFirstOrThrow({ where: { eventCode: "CAROLS-2026" } });
  const admin = await actorFor("admin@parliament.gh");
  const usher = await actorFor("usher@parliament.gh");

  assert.ok(admin.isSuperAdmin, "seeded admin is the super admin");
  assert.ok(can(admin, "platform.manage"));
  assert.ok(can(usher, "checkin.scan", event.id));
  assert.ok(!can(usher, "campaigns.dispatch", event.id), "usher must not dispatch campaigns");
  assert.ok(!can(usher, "guests.read", event.id), "usher must not browse the guest list");
  assert.ok(!SYSTEM_ROLES.admin.permissions.includes("platform.manage"), "event owners are not platform admins");
});

test("RBAC: a revoked role assignment grants nothing", async () => {
  const user = await prisma.user.findFirstOrThrow({ where: { email: "seating@parliament.gh" } });
  const assignment = await prisma.userRoleAssignment.findFirstOrThrow({ where: { userId: user.id, revokedAt: null } });
  await prisma.userRoleAssignment.update({ where: { id: assignment.id }, data: { revokedAt: new Date() } });
  try {
    const actor = await actorFor("seating@parliament.gh");
    assert.strictEqual(actor.globalPermissions.size, 0);
  } finally {
    await prisma.userRoleAssignment.update({ where: { id: assignment.id }, data: { revokedAt: null } });
  }
});

test("AI policy gate: an usher cannot run seating tools", async () => {
  const event = await prisma.event.findFirstOrThrow({ where: { eventCode: "CAROLS-2026" } });
  const usher = await actorFor("usher@parliament.gh");
  const result = await executeAiTool("propose_seating_allocation", { eventId: event.id, seatingPlanId: "dummy" }, usher);
  assert.strictEqual(result.status, "denied");
  assert.match(result.error, /Security Policy Gate/);
});

test("RBAC: ushers and check-in supervisors never get the AI assistant", async () => {
  const { SYSTEM_ROLES } = await import("../../src/lib/roles.ts");
  for (const key of ["usher", "checkin_supervisor"]) {
    const ai = SYSTEM_ROLES[key].permissions.filter((p) => p.startsWith("ai."));
    assert.deepStrictEqual(ai, [], `${key} must have no ai.* permission`);
  }
});
