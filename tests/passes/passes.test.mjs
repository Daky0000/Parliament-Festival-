// Guest passes: branded QR still scans, and every seated dignitary gets one.
import test from "node:test";
import assert from "node:assert";
import jsQR from "jsqr";
import { prisma } from "../../src/lib/db.ts";
import { qrMatrix, logoFootprint, passQrSvg } from "../../src/lib/pass-qr.ts";
import { activePassToken, scanUrl } from "../../src/lib/guest-tokens.ts";
import { verifyScan } from "../../src/lib/checkin.ts";
import { actorFromSession } from "../../src/lib/authz.ts";
import { createSession } from "../../src/lib/session.ts";
import { request, call, cookieFor, seededFixtures, userByEmail } from "../helpers.mjs";

const seating = await import("../../src/app/api/v1/seating/route.ts");
const passes = await import("../../src/app/api/v1/passes/route.ts");
const passOne = await import("../../src/app/api/v1/passes/[eventGuestId]/route.ts");

/** Renders the QR to RGBA pixels with the logo area painted white, as a phone camera would see it. */
function renderWithLogoHole(content, px = 6) {
  const m = qrMatrix(content);
  const quiet = 4;
  const total = m.size + quiet * 2;
  const hole = logoFootprint(m.size);
  const w = total * px;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++) {
      const inLogo = x >= hole.start && x < hole.end && y >= hole.start && y < hole.end;
      if (!m.isDark(x, y) || inLogo) continue;
      for (let dy = 0; dy < px; dy++)
        for (let dx = 0; dx < px; dx++) {
          const i = (((y + quiet) * px + dy) * w + (x + quiet) * px + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 10;
        }
    }
  return { data, w };
}

test("the QR with the centre logo still decodes, for realistic pass URLs", () => {
  for (const origin of ["https://festival.parliament.gh", "https://parliament-festival-production.example.workers.dev"]) {
    const url = `${origin}/check-in/scan/${"A".repeat(10)}${"x9_-".repeat(8)}abc`;
    const { data, w } = renderWithLogoHole(url);
    const decoded = jsQR(data, w, w);
    assert.ok(decoded, `did not decode for ${origin}`);
    assert.strictEqual(decoded.data, url);
  }
});

test("the pass SVG carries the logo and no personal data", () => {
  const svg = passQrSvg("https://festival.parliament.gh/check-in/scan/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG", { title: "Event pass" });
  assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /<circle /, "logo badge present");
  assert.ok(!/@|\+233/.test(svg));
});

async function newGuest(f, name) {
  const person = await prisma.person.create({ data: { organizationId: f.event.organizationId, fullName: `${name} ${Date.now()}` } });
  return prisma.eventGuest.create({ data: { eventId: f.event.id, personId: person.id, guestReference: `P-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, guestStatus: "active" } });
}

async function freshSection(f) {
  return prisma.seatingSection.create({
    data: { seatingPlanId: f.plan.id, sectionCode: `PASS-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: "Pass test section", capacity: 20, displayOrder: 998 },
  });
}

test("assigning a seat creates a working pass; reassigning keeps exactly one", async () => {
  const f = await seededFixtures();
  const cookie = await cookieFor("admin@parliament.gh");
  const guest = await newGuest(f, "Seated");
  const [s1, s2] = [await freshSection(f), await freshSection(f)];
  const assign = (sectionId) =>
    call(seating.POST, request("/api/v1/seating", { method: "POST", cookie, body: { action: "assign_seat", seatingPlanId: f.plan.id, eventGuestId: guest.id, sectionId } }));

  assert.strictEqual((await assign(s1.id)).status, 200);
  const token = await activePassToken(prisma, guest.id);
  assert.ok(token, "pass created on seat assignment");
  assert.strictEqual((await assign(s2.id)).status, 200);
  assert.strictEqual(await prisma.qrCredential.count({ where: { status: "active", invitation: { eventGuestId: guest.id } } }), 1);
  assert.strictEqual(await activePassToken(prisma, guest.id), token, "the same pass survives a reassignment");

  // The pass works at the gate.
  const usher = await userByEmail("usher@parliament.gh");
  const actor = await actorFromSession((await createSession(usher.id, { mfaPending: false })).session);
  const gate = await prisma.gate.findFirstOrThrow({ where: { eventId: f.event.id, code: "MAIN" } });
  const scan = await verifyScan(actor, token, gate.id);
  assert.strictEqual(scan.state, "VALID");
  assert.match(scan.guest.seat, /Pass test section/);
  assert.match(scanUrl(token), /\/check-in\/scan\//);
});

test("guests who declined get no pass", async () => {
  const f = await seededFixtures();
  const cookie = await cookieFor("admin@parliament.gh");
  const guest = await newGuest(f, "Declined");
  const version = await prisma.invitationTemplateVersion.findFirstOrThrow({ where: { template: { eventId: f.event.id }, status: "approved" } });
  const inv = await prisma.invitation.create({
    data: { eventId: f.event.id, eventGuestId: guest.id, templateVersionId: version.id, invitationReference: `X-${guest.id}`, tokenHash: `h-${guest.id}`, recipientEmailSnapshot: "x@example.org", recipientNameSnapshot: "x" },
  });
  await prisma.rsvp.create({ data: { invitationId: inv.id, response: "declined", confirmationReference: `DC-${guest.id}` } });
  const section = await freshSection(f);
  await call(seating.POST, request("/api/v1/seating", { method: "POST", cookie, body: { action: "assign_seat", seatingPlanId: f.plan.id, eventGuestId: guest.id, sectionId: section.id } }));
  assert.strictEqual(await activePassToken(prisma, guest.id), null);
});

test("generate-missing backfills seated guests, and downloads are permission-checked and audited", async () => {
  const f = await seededFixtures();
  const admin = await cookieFor("admin@parliament.gh");
  const guest = await newGuest(f, "Backfill");
  const section = await freshSection(f);
  // Seated directly (as before passes were automatic): no pass yet.
  await prisma.seatAssignment.create({ data: { seatingPlanId: f.plan.id, eventGuestId: guest.id, sectionId: section.id, status: "proposed" } });
  assert.strictEqual(await activePassToken(prisma, guest.id), null);

  const r = await call(passes.POST, request("/api/v1/passes", { method: "POST", cookie: admin, body: { eventId: f.event.id } }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.json.data.created >= 1);
  assert.ok(await activePassToken(prisma, guest.id));
  const again = await call(passes.POST, request("/api/v1/passes", { method: "POST", cookie: admin, body: { eventId: f.event.id } }));
  assert.strictEqual(again.json.data.created, 0, "idempotent");

  const usherDl = await call(passOne.GET, request(`/api/v1/passes/${guest.id}`, { cookie: await cookieFor("usher@parliament.gh") }), { eventGuestId: guest.id });
  assert.ok([403, 404].includes(usherDl.status), "ushers cannot download passes");
  const dl = await call(passOne.GET, request(`/api/v1/passes/${guest.id}`, { cookie: admin }), { eventGuestId: guest.id });
  assert.strictEqual(dl.status, 200);
  assert.strictEqual(dl.res.headers.get("content-type"), "image/svg+xml");
  assert.match(await dl.res.text(), /<svg/);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "pass.downloaded", entityId: guest.id } }));
});
