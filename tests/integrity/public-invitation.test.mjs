// Phase 2: guest-facing invitation and RSVP lifecycle.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { issueInvitation } from "../../src/lib/guest-tokens.ts";
import { sha256Hex } from "../../src/lib/crypto.ts";
import { request, call, seededFixtures } from "../helpers.mjs";

const route = await import("../../src/app/api/v1/public/invitations/[token]/route.ts");

async function freshInvitation(overrides = {}) {
  const f = await seededFixtures();
  const version = await prisma.invitationTemplateVersion.findFirstOrThrow({ where: { template: { eventId: f.event.id } } });
  const guest = await prisma.eventGuest.create({
    data: {
      eventId: f.event.id,
      personId: (await prisma.person.create({ data: { organizationId: f.event.organizationId, fullName: `Test Guest ${Date.now()}` } })).id,
      guestReference: `T-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companionAllowance: 2,
      guestStatus: "active",
    },
  });
  const { invitation, rawToken } = await issueInvitation(prisma, {
    eventId: f.event.id,
    eventGuestId: guest.id,
    templateVersionId: version.id,
    recipientEmailSnapshot: "guest@example.org",
    recipientNameSnapshot: "Test Guest",
    invitationStatus: "sent",
    ...overrides,
  });
  return { invitation, rawToken, event: f.event };
}

const get = (token) => call(route.GET, request(`/api/v1/public/invitations/${token}`), { token });
const post = (token, body, origin) =>
  call(route.POST, request(`/api/v1/public/invitations/${token}`, { method: "POST", body, origin }), { token });

test("GET is read-only: opening a link records nothing", async () => {
  const { invitation, rawToken } = await freshInvitation();
  const before = await prisma.invitationEvent.count({ where: { invitationId: invitation.id } });
  const r = await get(rawToken);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(await prisma.invitationEvent.count({ where: { invitationId: invitation.id } }), before);
  // The page's own script records the view explicitly.
  assert.strictEqual((await post(rawToken, { action: "view" })).status, 200);
  assert.strictEqual(await prisma.invitationEvent.count({ where: { invitationId: invitation.id } }), before + 1);
});

test("only the token hash and an encrypted copy are stored", async () => {
  const { invitation, rawToken } = await freshInvitation();
  const row = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
  assert.strictEqual(row.tokenHash, await sha256Hex(rawToken));
  assert.ok(row.tokenEnc && !row.tokenEnc.includes(rawToken));
});

test("revoked, expired and superseded links are rejected with one generic message", async () => {
  const a = await freshInvitation({ tokenRevokedAt: new Date() });
  const b = await freshInvitation({ tokenExpiresAt: new Date(Date.now() - 1000) });
  const c = await freshInvitation({ invitationStatus: "superseded" });
  const unknown = await get("x".repeat(43));
  const results = [await get(a.rawToken), await get(b.rawToken), await get(c.rawToken)];
  for (const r of results) {
    assert.strictEqual(r.status, 404);
    assert.deepStrictEqual(r.json, unknown.json);
  }
});

test("invalid companion counts are rejected", async () => {
  const { rawToken } = await freshInvitation();
  for (const companionCount of [-1, 1.5, "abc", 3]) {
    const r = await post(rawToken, { action: "rsvp", response: "accepted", companionCount });
    assert.strictEqual(r.status, 400, `companionCount ${JSON.stringify(companionCount)} gave ${r.status}`);
  }
});

test("accepting twice keeps exactly one active pass; declining revokes it", async () => {
  const { invitation, rawToken } = await freshInvitation();
  const first = await post(rawToken, { action: "rsvp", response: "accepted", companionCount: 1 });
  assert.strictEqual(first.status, 200, JSON.stringify(first.json));
  assert.match(first.json.data.qrCodeDataUrl, /^data:image\/png;base64,/);
  assert.ok(!("credentialHash" in first.json.data), "the stored hash is never returned");
  await post(rawToken, { action: "rsvp", response: "accepted", companionCount: 2 });
  assert.strictEqual(await prisma.qrCredential.count({ where: { invitationId: invitation.id, status: "active" } }), 1);

  // Re-opening the page shows the same pass.
  const again = await get(rawToken);
  assert.match(again.json.data.qrCodeDataUrl, /^data:image\/png;base64,/);

  await post(rawToken, { action: "rsvp", response: "declined" });
  assert.strictEqual(await prisma.qrCredential.count({ where: { invitationId: invitation.id, status: "active" } }), 0);
  assert.strictEqual(await prisma.rsvp.count({ where: { invitationId: invitation.id } }), 3, "RSVP history is append-only");
  const audit = await prisma.auditLog.count({ where: { entityId: invitation.id, action: { in: ["rsvp.submitted", "rsvp.changed"] } } });
  assert.strictEqual(audit, 3);
});

test("RSVPs are refused after the deadline and for cancelled events", async () => {
  const { rawToken, event } = await freshInvitation();
  const original = { rsvpDeadline: event.rsvpDeadline, status: event.status };
  try {
    await prisma.event.update({ where: { id: event.id }, data: { rsvpDeadline: new Date(Date.now() - 1000) } });
    assert.strictEqual((await post(rawToken, { action: "rsvp", response: "accepted" })).status, 409);
    assert.strictEqual((await get(rawToken)).json.data.acceptingResponses, false);
    await prisma.event.update({ where: { id: event.id }, data: { rsvpDeadline: null, status: "cancelled" } });
    assert.strictEqual((await post(rawToken, { action: "rsvp", response: "accepted" })).status, 410);
  } finally {
    await prisma.event.update({ where: { id: event.id }, data: original });
  }
});

test("cross-origin RSVP posts are rejected", async () => {
  const { rawToken } = await freshInvitation();
  assert.strictEqual((await post(rawToken, { action: "rsvp", response: "accepted" }, "https://evil.example")).status, 403);
});

test("the database rejects invalid RSVP values", async () => {
  const { invitation } = await freshInvitation();
  await assert.rejects(
    prisma.rsvp.create({ data: { invitationId: invitation.id, response: "maybe", confirmationReference: `X-${Date.now()}` } })
  );
});
