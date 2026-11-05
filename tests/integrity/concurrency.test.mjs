// Phase 2: capacity and duplicate protection under concurrent requests.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { request, call, cookieFor, seededFixtures } from "../helpers.mjs";

const seating = await import("../../src/app/api/v1/seating/route.ts");
const checkin = await import("../../src/app/api/v1/check-in/confirm/route.ts");
const events = await import("../../src/app/api/v1/events/[eventId]/route.ts");

async function makeGuests(eventId, organizationId, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const person = await prisma.person.create({ data: { organizationId, fullName: `Concurrency ${i} ${Date.now()}` } });
    out.push(
      await prisma.eventGuest.create({
        data: { eventId, personId: person.id, guestReference: `C-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`, guestStatus: "active" },
      })
    );
  }
  return out;
}

test("20 simultaneous assignments into a capacity-1 section: exactly one succeeds", async () => {
  const f = await seededFixtures();
  const cookie = await cookieFor("admin@parliament.gh");
  const section = await prisma.seatingSection.create({
    data: { seatingPlanId: f.plan.id, sectionCode: `CAP1-${Date.now()}`, name: "Capacity one", capacity: 1, displayOrder: 99 },
  });
  const guests = await makeGuests(f.event.id, f.event.organizationId, 20);
  const results = await Promise.all(
    guests.map((g) =>
      call(
        seating.POST,
        request("/api/v1/seating", {
          method: "POST",
          cookie,
          body: { action: "assign_seat", seatingPlanId: f.plan.id, eventGuestId: g.id, sectionId: section.id },
        })
      )
    )
  );
  const ok = results.filter((r) => r.status === 200).length;
  assert.strictEqual(ok, 1, `statuses: ${results.map((r) => r.status).join(",")}`);
  assert.ok(results.every((r) => r.status === 200 || r.status === 409));
  assert.strictEqual(await prisma.seatAssignment.count({ where: { sectionId: section.id, status: { in: ["proposed", "approved"] } } }), 1);
});

test("20 simultaneous check-ins for one guest: exactly one attendance record", async () => {
  const f = await seededFixtures();
  const cookie = await cookieFor("usher@parliament.gh");
  const [guest] = await makeGuests(f.event.id, f.event.organizationId, 1);
  const gate = await prisma.gate.findFirstOrThrow({ where: { eventId: f.event.id, code: "MAIN" } });
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      call(checkin.POST, request("/api/v1/check-in/confirm", { method: "POST", cookie, body: { eventId: f.event.id, gateId: gate.id, eventGuestId: guest.id, method: "manual" } }))
    )
  );
  assert.strictEqual(results.filter((r) => r.status === 200).length, 1, `statuses: ${results.map((r) => r.status).join(",")}`);
  assert.strictEqual(await prisma.attendanceRecord.count({ where: { eventGuestId: guest.id, checkinStatus: "checked_in" } }), 1);
});

test("event lifecycle: only allowed transitions, each audited", async () => {
  const f = await seededFixtures();
  const cookie = await cookieFor("admin@parliament.gh");
  const ev = await prisma.event.create({ data: { organizationId: f.event.organizationId, eventCode: `LC-${Date.now()}`, name: "Lifecycle", status: "draft" } });
  const move = (to) =>
    call(events.PATCH, request(`/api/v1/events/${ev.id}`, { method: "PATCH", cookie, body: { action: "transition", to } }), { eventId: ev.id });
  assert.strictEqual((await move("completed")).status, 409, "draft cannot jump to completed");
  assert.strictEqual((await move("scheduled")).status, 200);
  assert.strictEqual((await move("active")).status, 200);
  assert.strictEqual((await move("draft")).status, 409);
  assert.strictEqual((await move("completed")).status, 200);
  assert.strictEqual((await move("archived")).status, 200);
  assert.strictEqual((await move("active")).status, 409, "archived is final");
  assert.strictEqual(await prisma.auditLog.count({ where: { entityId: ev.id, action: "event.status_changed" } }), 4);
});
