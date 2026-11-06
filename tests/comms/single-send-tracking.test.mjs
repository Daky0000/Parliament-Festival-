// Adding a dignitary allocates a seat automatically; one dignitary can be
// emailed with one click (approved template, not editable); and opens of
// that email are tracked per dignitary through our own signed pixel.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { request, call, cookieFor, seededFixtures } from "../helpers.mjs";
import { openTrackingToken, verifyOpenTrackingToken, withOpenPixel } from "../../src/lib/email/tracking.ts";
import { emailTrackingFor } from "../../src/lib/email/tracking-summary.ts";
import { seatCodeFor } from "../../src/lib/seating/auto-seat.ts";

const guests = await import("../../src/app/api/v1/guests/route.ts");
const sendOne = await import("../../src/app/api/v1/guests/[eventGuestId]/send-invitation/route.ts");
const pixel = await import("../../src/app/api/v1/public/track/open/[token]/route.ts");
const tracking = await import("../../src/app/api/v1/email-tracking/route.ts");
const detail = await import("../../src/app/api/v1/guests/[eventGuestId]/route.ts");

const uniq = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

async function freshSection(f, capacity = 3) {
  const category = await prisma.protocolCategory.create({
    data: { eventId: f.event.id, categoryKey: `auto-${uniq()}`, name: "Auto seat test", rankOrder: 500 + Math.floor(Math.random() * 100000), colourHex: "#3F6212" },
  });
  const section = await prisma.seatingSection.create({
    data: { seatingPlanId: f.plan.id, sectionCode: `AUT${uniq().slice(-5).toUpperCase()}`, name: "Auto seat section", capacity, displayOrder: 997, protocolCategoryId: category.id },
  });
  return { category, section };
}

async function addGuest(cookie, f, category, extra = {}) {
  return call(
    guests.POST,
    request("/api/v1/guests", {
      method: "POST",
      cookie,
      body: { eventId: f.event.id, title: "Hon.", fullName: `Auto Seat ${uniq()}`, designation: "Member of Parliament", company: "Parliament of Ghana", email: `auto-${uniq()}@example.org`, protocolCategoryId: category.id, ...extra },
    })
  );
}

test("seat codes follow the section, ten seats per row", () => {
  assert.strictEqual(seatCodeFor("SEC-A", 1).seatCode, "SEC-A-R1-S01");
  assert.strictEqual(seatCodeFor("SEC-A", 10).seatCode, "SEC-A-R1-S10");
  assert.strictEqual(seatCodeFor("SEC-A", 11).seatCode, "SEC-A-R2-S01");
});

test("adding dignitaries allocates the next free seat in their rank's section, never twice, and stops at capacity", async () => {
  const f = await seededFixtures();
  const cookie = await cookieFor("admin@parliament.gh");
  const { category, section } = await freshSection(f, 3);

  const results = await Promise.all([0, 1, 2].map(() => addGuest(cookie, f, category)));
  for (const r of results) assert.strictEqual(r.status, 201, JSON.stringify(r.json));
  const codes = results.map((r) => r.json.data.seatAssignments[0].seat?.seatCode);
  assert.ok(codes.every(Boolean), "every guest has a seat number");
  assert.strictEqual(new Set(codes).size, 3, "no seat is given twice");
  for (const r of results) assert.strictEqual(r.json.data.seatAssignments[0].section.id, section.id);
  assert.ok(results.every((r) => /^GH-GST-/.test(r.json.data.guestReference)), "reference generated");

  const full = await addGuest(cookie, f, category);
  assert.strictEqual(full.status, 201);
  assert.strictEqual(full.json.data.seatAssignments.length, 0, "section full: guest is left unseated, the section is never overfilled");
  assert.strictEqual(await prisma.seatAssignment.count({ where: { sectionId: section.id, status: { in: ["proposed", "approved"] } } }), 3);
});

test("designation 'Others' is stored as the typed text", async () => {
  const f = await seededFixtures();
  const cookie = await cookieFor("admin@parliament.gh");
  const { category } = await freshSection(f, 5);
  const r = await addGuest(cookie, f, category, { designation: "Executive Secretary, Peace Council" });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.json.data.person.designation, "Executive Secretary, Peace Council");
});

test("tracking tokens are signed and the pixel is placed before </body>", async () => {
  const id = crypto.randomUUID();
  const token = await openTrackingToken(id, 2);
  assert.deepStrictEqual(await verifyOpenTrackingToken(`${token}.gif`), { invitationId: id, attemptNumber: 2 });
  assert.strictEqual(await verifyOpenTrackingToken(token.replace(/.$/, (c) => (c === "a" ? "b" : "a"))), null, "tampered");
  assert.strictEqual(await verifyOpenTrackingToken(`${crypto.randomUUID()}.2.${token.split(".")[2]}`), null, "other invitation");
  assert.match(withOpenPixel("<html><body><p>x</p></body></html>", "https://x/p.gif"), /<img src="https:\/\/x\/p.gif"[^>]*><\/body>/);
});

test("one-click send uses the approved template; opening the email is tracked for that dignitary only", async () => {
  const f = await seededFixtures();
  const admin = await cookieFor("admin@parliament.gh");
  const { category } = await freshSection(f, 5);
  const created = await addGuest(admin, f, category);
  const guestId = created.json.data.id;
  const bystander = (await addGuest(admin, f, category)).json.data.id;
  await call(sendOne.POST, request(`/api/v1/guests/${bystander}/send-invitation`, { method: "POST", cookie: admin }), { eventGuestId: bystander });

  // Ushers may not send.
  const usher = await call(sendOne.POST, request(`/api/v1/guests/${guestId}/send-invitation`, { method: "POST", cookie: await cookieFor("usher@parliament.gh") }), { eventGuestId: guestId });
  assert.ok([403, 404].includes(usher.status));

  const sent = await call(sendOne.POST, request(`/api/v1/guests/${guestId}/send-invitation`, { method: "POST", cookie: admin }), { eventGuestId: guestId });
  assert.strictEqual(sent.status, 200, JSON.stringify(sent.json));
  assert.strictEqual(sent.json.data.tracking.status, "sent");

  const inv = await prisma.invitation.findFirstOrThrow({ where: { eventGuestId: guestId }, include: { emailAttempts: true } });
  assert.strictEqual(inv.invitationStatus, "sent");
  assert.strictEqual(inv.emailAttempts.length, 1);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "INVITATION_SENT_SINGLE", entityId: guestId } }));

  // A second click straight away is refused (no duplicate emails).
  const again = await call(sendOne.POST, request(`/api/v1/guests/${guestId}/send-invitation`, { method: "POST", cookie: admin }), { eventGuestId: guestId });
  assert.strictEqual(again.status, 429);

  // Forged pixel: still a GIF, nothing recorded.
  const forged = await pixel.GET(request(`/api/v1/public/track/open/${inv.id}.1.deadbeef.gif`), { params: Promise.resolve({ token: `${inv.id}.1.deadbeef.gif` }) });
  assert.strictEqual(forged.headers.get("content-type"), "image/gif");
  assert.strictEqual(await prisma.invitationEvent.count({ where: { invitationId: inv.id, eventType: "open_signal" } }), 0);

  // Real open (twice in a row counts once).
  const token = `${await openTrackingToken(inv.id, 1)}.gif`;
  for (let i = 0; i < 2; i++) {
    const res = await pixel.GET(request(`/api/v1/public/track/open/${token}`), { params: Promise.resolve({ token }) });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("content-type"), "image/gif");
  }
  assert.strictEqual(await prisma.invitationEvent.count({ where: { invitationId: inv.id, eventType: "open_signal" } }), 1);

  const live = await call(tracking.GET, request(`/api/v1/email-tracking?eventId=${f.event.id}`, { cookie: admin }));
  assert.strictEqual(live.status, 200);
  assert.strictEqual(live.json.data[guestId].status, "opened");
  assert.ok(live.json.data[guestId].firstOpenedAt);
  assert.strictEqual(live.json.data[bystander].status, "sent", "another dignitary is not marked opened by this open");

  // The fast database summary matches the row-by-row one for every guest.
  const { emailTrackingForEvent, trackingInvitationInclude } = await import("../../src/lib/email/tracking-summary.ts");
  const fast = await emailTrackingForEvent(prisma, f.event.id);
  for (const id of [guestId, bystander]) {
    const rows = await prisma.invitation.findMany({ where: { eventGuestId: id }, include: trackingInvitationInclude });
    assert.deepStrictEqual(fast.get(id), emailTrackingFor(rows), `summary for ${id}`);
  }

  // The detail panel shows the send history with its opens.
  const d = await call(detail.GET, request(`/api/v1/guests/${guestId}`, { cookie: admin }), { eventGuestId: guestId });
  assert.strictEqual(d.status, 200, JSON.stringify(d.json));
  assert.strictEqual(d.json.data.sends.length, 1);
  assert.strictEqual(d.json.data.sends[0].via, "direct");
  assert.strictEqual(d.json.data.sends[0].opens, 1);
  assert.strictEqual(d.json.data.tracking.sendCount, 1);
  assert.ok(d.json.data.activity.some((a) => a.type === "open_signal"));
  assert.ok(d.json.data.seat?.seatCode, "seat shown");
  const usherDetail = await call(detail.GET, request(`/api/v1/guests/${guestId}`, { cookie: await cookieFor("usher@parliament.gh") }), { eventGuestId: guestId });
  assert.ok([403, 404].includes(usherDetail.status), "ushers cannot read guest details");
});


test("tracking summary: a click or RSVP visit counts as opened even with images blocked", () => {
  const at = new Date();
  const t = emailTrackingFor([{ emailAttempts: [{ status: "delivered", submittedAt: at, createdAt: at }], invitationEvents: [{ eventType: "link_access", occurredAt: at }] }]);
  assert.strictEqual(t.status, "clicked");
  assert.strictEqual(emailTrackingFor([]).status, "not_sent");
  assert.strictEqual(emailTrackingFor([{ emailAttempts: [{ status: "failed", submittedAt: null, createdAt: at, errorMessage: "x" }], invitationEvents: [] }]).status, "failed");
});

test("every email gets the Powered by DakyXTech footer, linked, with the phone number, once", async () => {
  const { withPoweredBy, withPoweredByText } = await import("../../src/lib/email/powered-by.ts");
  const html = withPoweredBy("<html><body><p>Invitation</p></body></html>");
  assert.match(html, /Powered by <a href="https:\/\/dakyx\.com"[^>]*>DakyXTech<\/a>/);
  assert.match(html, /href="tel:\+233545950611"[^>]*>\+233 545 950 611</);
  assert.ok(html.indexOf("Powered by") < html.indexOf("</body>"), "inside the body");
  assert.strictEqual(withPoweredBy(html), html, "never added twice");
  const text = withPoweredByText("Invitation");
  assert.ok(text.includes("Powered by DakyXTech (https://dakyx.com)") && text.includes("+233 545 950 611"));
});
