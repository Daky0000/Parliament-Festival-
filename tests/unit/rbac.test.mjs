import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { hasPermission } from "../../src/lib/auth.ts";
import { executeAiTool } from "../../src/lib/ai/orchestrator.ts";

test("RBAC & Security Policy Gate: enforces event-scoped permissions and blocks unauthorized tool actions", async () => {
  const adminUser = await prisma.user.findFirst({
    where: { email: "admin@parliament.gh" },
  });
  const usherUser = await prisma.user.findFirst({
    where: { email: "usher@parliament.gh" },
  });
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
  });

  assert.ok(adminUser, "Admin user must exist");
  assert.ok(usherUser, "Usher user must exist");
  assert.ok(event, "Event must exist");

  // 1. Admin has platform.manage and campaigns.dispatch
  const adminHasManage = await hasPermission(adminUser.id, event.id, "platform.manage");
  assert.strictEqual(adminHasManage, true, "Admin must have platform.manage");

  // 2. Usher does NOT have campaigns.dispatch or seating.assign
  const usherHasDispatch = await hasPermission(usherUser.id, event.id, "campaigns.dispatch");
  assert.strictEqual(usherHasDispatch, false, "Usher must not have campaigns.dispatch");

  // 3. AI Tool Policy Gate: Usher cannot run write tools
  const toolResult = await executeAiTool(
    "propose_seating_allocation",
    { eventId: event.id, seatingPlanId: "dummy" },
    usherUser.id,
    ["checkin.scan"] // Usher only has scan permission
  );

  assert.strictEqual(toolResult.status, "denied", "AI tool execution must be denied for unauthorized users");
  assert.match(
    toolResult.error,
    /Security Policy Gate/,
    "Error must cite security policy gate enforcement"
  );
});
