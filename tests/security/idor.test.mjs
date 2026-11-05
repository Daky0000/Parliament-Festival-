// A user scoped to one event, or belonging to another organization, must not
// reach another event's records by changing IDs.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { syncRoles } from "../../src/lib/roles.ts";
import { createSession, sessionCookieName } from "../../src/lib/session.ts";
import { request, call, seededFixtures } from "../helpers.mjs";

const guests = await import("../../src/app/api/v1/guests/route.ts");
const eventOne = await import("../../src/app/api/v1/events/[eventId]/route.ts");
const eventsList = await import("../../src/app/api/v1/events/route.ts");
const seating = await import("../../src/app/api/v1/seating/route.ts");

async function makeUser(orgId, roleKey, eventId) {
  const roleIds = await syncRoles(prisma, orgId);
  const user = await prisma.user.create({
    data: { organizationId: orgId, email: `idor-${roleKey}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.org`, fullName: "IDOR Test", status: "active" },
  });
  await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: roleIds[roleKey], eventId } });
  const { rawToken } = await createSession(user.id, { mfaPending: false });
  return `${sessionCookieName()}=${rawToken}`;
}

test("another organization cannot read or change this organization's event", async () => {
  const f = await seededFixtures();
  const otherOrg = await prisma.organization.create({ data: { name: "Other Org", slug: `other-${Date.now()}` } });
  const cookie = await makeUser(otherOrg.id, "admin", null);

  const list = await call(eventsList.GET, request("/api/v1/events", { cookie }));
  assert.strictEqual(list.status, 200);
  assert.ok(!list.json.data.some((e) => e.id === f.event.id), "foreign event leaked in list");

  assert.strictEqual((await call(eventOne.GET, request(`/api/v1/events/${f.event.id}`, { cookie }), { eventId: f.event.id })).status, 404);
  assert.strictEqual((await call(guests.GET, request(`/api/v1/guests?eventId=${f.event.id}`, { cookie }))).status, 404);
  const patch = await call(guests.PATCH, request("/api/v1/guests", { method: "PATCH", cookie, body: { eventGuestId: f.guest.id, protocolCategoryId: null } }));
  assert.strictEqual(patch.status, 404);
  const seat = await call(seating.POST, request("/api/v1/seating", { method: "POST", cookie, body: { action: "approve_plan", seatingPlanId: f.plan.id } }));
  assert.strictEqual(seat.status, 404);
});

test("a user scoped to event B cannot reach event A in the same organization", async () => {
  const f = await seededFixtures();
  const eventB = await prisma.event.create({
    data: { organizationId: f.event.organizationId, eventCode: `B-${Date.now()}`, name: "Event B", status: "draft" },
  });
  const cookie = await makeUser(f.event.organizationId, "protocol_officer", eventB.id);

  assert.strictEqual((await call(guests.GET, request(`/api/v1/guests?eventId=${eventB.id}`, { cookie }))).status, 200);
  assert.strictEqual((await call(guests.GET, request(`/api/v1/guests?eventId=${f.event.id}`, { cookie }))).status, 404);
  const list = await call(eventsList.GET, request("/api/v1/events", { cookie }));
  assert.deepStrictEqual(list.json.data.map((e) => e.id), [eventB.id]);
});
