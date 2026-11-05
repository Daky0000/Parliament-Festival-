// Usher dashboard: in-page scan verification, reference entry, and email engagement counts.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { ensureActiveCredential, issueInvitation } from "../../src/lib/guest-tokens.ts";
import { enqueueCampaign, processQueue, campaignEngagement } from "../../src/lib/campaigns/engine.ts";
import { request, call, cookieFor, seededFixtures } from "../helpers.mjs";

const verify = await import("../../src/app/api/v1/check-in/verify/route.ts");
const lookup = await import("../../src/app/api/v1/check-in/lookup/route.ts");

async function guestWithPassAndSeat() {
  const f = await seededFixtures();
  const version = await prisma.invitationTemplateVersion.findFirstOrThrow({ where: { template: { eventId: f.event.id } } });
  const person = await prisma.person.create({ data: { organizationId: f.event.organizationId, fullName: `Dash Guest ${Date.now()}` } });
  const guest = await prisma.eventGuest.create({ data: { eventId: f.event.id, personId: person.id, guestReference: `D-${Date.now()}`, guestStatus: "active" } });
  const { invitation } = await issueInvitation(prisma, {
    eventId: f.event.id, eventGuestId: guest.id, templateVersionId: version.id,
    recipientEmailSnapshot: "d@example.org", recipientNameSnapshot: person.fullName, invitationStatus: "sent",
  });
  await prisma.rsvp.create({ data: { invitationId: invitation.id, response: "accepted", confirmationReference: `DR-${guest.id}` } });
  const cred = await ensureActiveCredential(prisma, { invitationId: invitation.id, eventId: f.event.id, expiresAt: null });
  const section = await prisma.seatingSection.create({
    data: { seatingPlanId: f.plan.id, sectionCode: `DASH-SEC-${Date.now()}`, name: "Dashboard test section", capacity: 50, displayOrder: 999, isActive: false },
  });
  const seat = await prisma.seat.create({ data: { sectionId: section.id, seatCode: `DASH-${Date.now()}`, seatStatus: "available" } });
  await prisma.seatAssignment.create({ data: { seatingPlanId: f.plan.id, eventGuestId: guest.id, sectionId: section.id, seatId: seat.id, status: "proposed" } });
  const gate = await prisma.gate.findFirstOrThrow({ where: { eventId: f.event.id, code: "MAIN" } });
  return { f, guest, invitation, token: cred.rawToken, seat, gate };
}

test("in-page scan verifies automatically without recording attendance", async () => {
  const { token, gate, guest } = await guestWithPassAndSeat();
  const cookie = await cookieFor("usher@parliament.gh");
  const before = await prisma.attendanceRecord.count();
  const r = await call(verify.POST, request("/api/v1/check-in/verify", { method: "POST", cookie, body: { token, gateId: gate.id } }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.data.state, "VALID");
  assert.strictEqual(r.json.data.guest.eventGuestId, guest.id);
  assert.strictEqual(await prisma.attendanceRecord.count(), before);
});

test("enter reference: guest reference, invitation reference and seat number all find the guest, then verify", async () => {
  const { f, guest, invitation, seat, gate } = await guestWithPassAndSeat();
  const cookie = await cookieFor("usher@parliament.gh");
  for (const q of [guest.guestReference, invitation.invitationReference, seat.seatCode]) {
    const r = await call(lookup.GET, request(`/api/v1/check-in/lookup?eventId=${f.event.id}&q=${encodeURIComponent(q)}`, { cookie }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data[0]?.eventGuestId, guest.id, `lookup by ${q}`);
  }
  const v = await call(verify.POST, request("/api/v1/check-in/verify", { method: "POST", cookie, body: { eventId: f.event.id, eventGuestId: guest.id, gateId: gate.id } }));
  assert.strictEqual(v.json.data.state, "VALID");
  const wrongGate = await prisma.gate.findFirstOrThrow({ where: { eventId: f.event.id, code: "VIP" } });
  const w = await call(verify.POST, request("/api/v1/check-in/verify", { method: "POST", cookie, body: { eventId: f.event.id, eventGuestId: guest.id, gateId: wrongGate.id } }));
  assert.strictEqual(w.json.data.state, "WRONG_GATE");
});

test("campaign engagement counts opens, button clicks, page visits and responses per invitation", async () => {
  const f = await seededFixtures();
  const event = await prisma.event.create({ data: { organizationId: f.event.organizationId, eventCode: `EN-${Date.now()}`, name: "Engagement", status: "active" } });
  const template = await prisma.invitationTemplate.create({ data: { eventId: event.id, name: "t" } });
  const tv = await prisma.invitationTemplateVersion.create({ data: { templateId: template.id, versionNumber: 1, subjectTemplate: "s", htmlContent: "<p>x</p>", textContent: "x", status: "approved" } });
  for (let i = 0; i < 3; i++) {
    const p = await prisma.person.create({ data: { organizationId: f.event.organizationId, fullName: `E${i}`, email: `e${i}-${event.id}@example.org` } });
    await prisma.eventGuest.create({ data: { eventId: event.id, personId: p.id, guestReference: `EN-${event.id.slice(0, 6)}-${i}`, guestStatus: "active" } });
  }
  const campaign = await prisma.invitationCampaign.create({
    data: { eventId: event.id, templateVersionId: tv.id, name: "E", senderName: "O", senderEmail: "o@example.org", subjectSnapshot: "s", status: "approved", createdBy: f.usher.id },
  });
  await enqueueCampaign(campaign.id);
  while ((await processQueue(10)).processed > 0) { /* drain */ }
  const invs = await prisma.invitation.findMany({ where: { campaignId: campaign.id } });
  // Guest 0: opened twice + clicked + visited + responded; guest 1: opened only.
  await prisma.invitationEvent.createMany({
    data: [
      { invitationId: invs[0].id, eventType: "open_signal", source: "resend_webhook" },
      { invitationId: invs[0].id, eventType: "open_signal", source: "resend_webhook" },
      { invitationId: invs[0].id, eventType: "click", source: "resend_webhook" },
      { invitationId: invs[0].id, eventType: "link_access", source: "page_script" },
      { invitationId: invs[1].id, eventType: "open_signal", source: "resend_webhook" },
    ],
  });
  await prisma.rsvp.create({ data: { invitationId: invs[0].id, response: "accepted", confirmationReference: `EN-${invs[0].id}` } });
  assert.deepStrictEqual(await campaignEngagement(campaign.id), { sent: 3, trackedOpens: 2, buttonClicks: 1, pageVisits: 1, responded: 1 });
});
