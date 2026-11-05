// Phase 5: exports, readiness and the seating engine.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { csvCell, toCsv } from "../../src/lib/csv.ts";
import { eventReadiness } from "../../src/lib/readiness.ts";
import { runDeterministicSeatingEngine } from "../../src/lib/seating/engine.ts";
import { request, call, cookieFor, seededFixtures } from "../helpers.mjs";

const reports = await import("../../src/app/api/v1/reports/[report]/route.ts");

test("CSV cells that look like formulas are neutralised", () => {
  for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2", "@SUM(A1)", "\tcmd"]) {
    assert.ok(csvCell(evil).replace(/^"/, "").startsWith("'"), evil);
  }
  assert.strictEqual(csvCell('a,"b"'), '"a,""b"""');
  assert.ok(toCsv(["h"], [["v"]]).startsWith("﻿h\r\nv"));
});

test("exports: permission-checked, contact details off by default, audited", async () => {
  const f = await seededFixtures();
  const admin = await cookieFor("admin@parliament.gh");
  const usher = await cookieFor("usher@parliament.gh");
  const get = (cookie, report, qs = "") =>
    call(reports.GET, request(`/api/v1/reports/${report}?eventId=${f.event.id}${qs}`, { cookie }), { report });

  assert.ok([403, 404].includes((await get(usher, "guests")).status), "ushers cannot export guests");
  assert.strictEqual((await get(admin, "nope")).status, 404);

  const before = await prisma.auditLog.count({ where: { action: "report.exported" } });
  const plain = await get(admin, "guests");
  assert.strictEqual(plain.status, 200);
  const text = await plain.res.text();
  assert.ok(!/Email/.test(text.split("\r\n")[0]), "no contact columns by default");
  assert.match(plain.res.headers.get("content-disposition"), /attachment; filename=".*guests.*\.csv"/);
  const withContact = await (await get(admin, "guests", "&include=contact")).res.text();
  assert.match(withContact.split("\r\n")[0], /Email,Phone/);
  assert.strictEqual(await prisma.auditLog.count({ where: { action: "report.exported" } }), before + 2);

  for (const r of ["rsvps", "attendance", "seating", "communications", "exceptions", "audit"]) {
    assert.strictEqual((await get(admin, r)).status, 200, r);
  }
});

test("readiness is computed from real state", async () => {
  const f = await seededFixtures();
  const items = await eventReadiness(f.event.id);
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.strictEqual(byKey.gates.ready, true, "seed has gates with an usher");
  assert.strictEqual(byKey.template.ready, true);
  assert.strictEqual(byKey.checkin_window.ready, f.event.status === "active");
});

test("seating engine overflows only into equal-or-lower precedence sections", async () => {
  const f = await seededFixtures();
  const org = f.event.organizationId;
  const ev = await prisma.event.create({ data: { organizationId: org, eventCode: `SE-${Date.now()}`, name: "Engine", status: "active" } });
  const high = await prisma.protocolCategory.create({ data: { eventId: ev.id, categoryKey: "high", name: "High", rankOrder: 1, colourHex: "#000000" } });
  const low = await prisma.protocolCategory.create({ data: { eventId: ev.id, categoryKey: "low", name: "Low", rankOrder: 2, colourHex: "#111111" } });
  const plan = await prisma.seatingPlan.create({ data: { eventId: ev.id, name: "Plan", versionNumber: 1 } });
  const highSec = await prisma.seatingSection.create({ data: { seatingPlanId: plan.id, sectionCode: "H", name: "High section", protocolCategoryId: high.id, capacity: 1, displayOrder: 1 } });
  const lowSec = await prisma.seatingSection.create({ data: { seatingPlanId: plan.id, sectionCode: "L", name: "Low section", protocolCategoryId: low.id, capacity: 1, displayOrder: 2 } });
  const mk = async (name, cat) => {
    const p = await prisma.person.create({ data: { organizationId: org, fullName: name } });
    return prisma.eventGuest.create({ data: { eventId: ev.id, personId: p.id, protocolCategoryId: cat.id, guestReference: `SE-${ev.id.slice(0, 6)}-${name}`, guestStatus: "active" } });
  };
  const h1 = await mk("H1", high);
  const h2 = await mk("H2", high);
  const l1 = await mk("L1", low);

  const result = await runDeterministicSeatingEngine(ev.id, plan.id);
  const where = async (g) => (await prisma.seatAssignment.findFirst({ where: { eventGuestId: g.id, status: "proposed" } }))?.sectionId ?? null;
  assert.strictEqual(await where(h1), highSec.id);
  assert.strictEqual(await where(h2), lowSec.id, "a high-rank overflow may use a lower-precedence section");
  assert.strictEqual(await where(l1), null, "low rank never takes the high section; it is reported unseated");
  assert.ok(result.conflicts.some((c) => c.type === "OVERFLOW_ASSIGNED"));
  assert.ok(result.conflicts.some((c) => c.type === "CAPACITY_EXCEEDED"));
  // Running again changes nothing.
  await runDeterministicSeatingEngine(ev.id, plan.id);
  assert.strictEqual(await prisma.seatAssignment.count({ where: { seatingPlanId: plan.id, status: "proposed" } }), 2);
});
