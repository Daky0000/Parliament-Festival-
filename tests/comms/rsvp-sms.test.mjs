// Accepting an invitation sends one thank-you SMS with what an usher needs:
// rank, seat, confirmation code and guest reference. The code then finds the
// guest in the usher portal.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { issueInvitation } from "../../src/lib/guest-tokens.ts";
import { lookupGuests } from "../../src/lib/checkin.ts";
import { rsvpConfirmationText } from "../../src/lib/sms/rsvp-confirmation.ts";
import { request, call, seededFixtures } from "../helpers.mjs";

const route = await import("../../src/app/api/v1/public/invitations/[token]/route.ts");

async function enableVynfy() {
  const data = { isEnabled: true, metadata: "{}" };
  await prisma.platformIntegration.upsert({
    where: { providerKey: "vynfy" },
    update: data,
    create: { providerKey: "vynfy", displayName: "Vynfy", integrationType: "sms", ...data },
  });
}

test("the thank-you text carries rank, seat, code and reference", () => {
  const t = rsvpConfirmationText({
    name: "Hon. Kwame Mensah", eventName: "2026 Festival of Nine Lessons and Carols", when: "Fri, 18 Dec 2026, 4:00 PM",
    venue: "Forecourt of Parliament", rank: "Rank 1, Parliamentary Leadership", seat: "Section A, SEC-A-R1-S04",
    confirmationCode: "CONF-ABC12345", guestReference: "GH-GST-XYZ", companions: 1,
  });
  for (const part of ["Hon. Kwame Mensah", "Rank 1, Parliamentary Leadership", "SEC-A-R1-S04", "CONF-ABC12345", "GH-GST-XYZ", "Companions: 1"]) {
    assert.ok(t.includes(part), part);
  }
});

test("accepting sends one confirmation SMS; declining sends none; the code finds the guest", async () => {
  await enableVynfy();
  const f = await seededFixtures();
  const version = await prisma.invitationTemplateVersion.findFirstOrThrow({ where: { template: { eventId: f.event.id }, status: "approved" } });
  const person = await prisma.person.create({ data: { organizationId: f.event.organizationId, title: "Hon.", fullName: `Sms Guest ${Date.now()}`, phone: "024 412 3456" } });
  const guest = await prisma.eventGuest.create({
    data: { eventId: f.event.id, personId: person.id, guestReference: `SMS-${Date.now()}`, companionAllowance: 2, guestStatus: "active", protocolCategoryId: f.category.id },
  });
  const { invitation, rawToken } = await issueInvitation(prisma, {
    eventId: f.event.id, eventGuestId: guest.id, templateVersionId: version.id,
    recipientEmailSnapshot: "x@example.org", recipientNameSnapshot: "x", invitationStatus: "sent",
  });
  const post = (body) => call(route.POST, request(`/api/v1/public/invitations/${rawToken}`, { method: "POST", body }), { token: rawToken });

  const r = await post({ action: "rsvp", response: "accepted", companionCount: 1 });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const code = r.json.data.confirmationReference;
  const sms = await prisma.communicationMessage.findMany({ where: { eventGuestId: guest.id, messageType: "rsvp_confirmation" } });
  assert.strictEqual(sms.length, 1);
  assert.strictEqual(sms[0].status, "submitted");
  assert.strictEqual(sms[0].recipientSnapshot, "+233244123456");
  assert.strictEqual(sms[0].invitationId, invitation.id);
  assert.ok(sms[0].bodySnippet.startsWith(`Thank you, Hon. ${person.fullName}`));

  const found = await lookupGuests(f.event.id, code);
  assert.strictEqual(found[0]?.eventGuestId, guest.id, "usher can find the guest by the SMS confirmation code");

  await post({ action: "rsvp", response: "declined" });
  assert.strictEqual(await prisma.communicationMessage.count({ where: { eventGuestId: guest.id, messageType: "rsvp_confirmation" } }), 1, "no SMS for a decline");
});
