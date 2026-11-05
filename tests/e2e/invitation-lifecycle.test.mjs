// End-to-end invitation journey through the real route handlers:
// create campaign -> approve (different person) -> dispatch -> queue sends ->
// verified "delivered" webhook -> guest opens link and accepts -> pass issued
// -> usher checks the guest in -> a second check-in is refused.
import test from "node:test";
import assert from "node:assert";
import { Webhook } from "svix";
import { prisma } from "../../src/lib/db.ts";
import { processQueue } from "../../src/lib/campaigns/engine.ts";
import { invitationRawToken } from "../../src/lib/guest-tokens.ts";
import { request, call, cookieFor, seededFixtures } from "../helpers.mjs";

const SECRET = "whsec_" + Buffer.from("e2e-webhook-secret-0123456789abc").toString("base64");
process.env.RESEND_WEBHOOK_SECRET = SECRET;

const campaigns = await import("../../src/app/api/v1/campaigns/route.ts");
const campaignOne = await import("../../src/app/api/v1/campaigns/[campaignId]/route.ts");
const webhook = await import("../../src/app/api/v1/webhooks/email/route.ts");
const publicInv = await import("../../src/app/api/v1/public/invitations/[token]/route.ts");
const checkin = await import("../../src/app/api/v1/check-in/confirm/route.ts");
import { findCredentialByToken } from "../../src/lib/guest-tokens.ts";

test("full invitation lifecycle", async () => {
  const f = await seededFixtures();
  const admin = await cookieFor("admin@parliament.gh");
  const approver = await cookieFor("approver@parliament.gh");
  const usher = await cookieFor("usher@parliament.gh");
  const version = await prisma.invitationTemplateVersion.findFirstOrThrow({ where: { template: { eventId: f.event.id }, status: "approved" } });
  // A fresh guest in a fresh category, so the journey is repeatable.
  const top = await prisma.protocolCategory.findFirst({ where: { eventId: f.event.id }, orderBy: { rankOrder: "desc" } });
  const stamp = Date.now();
  const category = await prisma.protocolCategory.create({
    data: { eventId: f.event.id, categoryKey: `e2e_${stamp}`, name: "E2E", colourHex: "#2563EB", rankOrder: (top?.rankOrder ?? 0) + 1 },
  });
  const person = await prisma.person.create({ data: { organizationId: f.event.organizationId, fullName: `E2E Guest ${stamp}`, email: `e2e-${stamp}@example.org` } });
  await prisma.eventGuest.create({
    data: { eventId: f.event.id, personId: person.id, protocolCategoryId: category.id, guestReference: `E2E-${stamp}`, guestStatus: "active" },
  });

  // 1. Create (admin) and approve (approver — a different person)
  const created = await call(campaigns.POST, request("/api/v1/campaigns", {
    method: "POST", cookie: admin,
    body: { eventId: f.event.id, name: `E2E ${Date.now()}`, templateVersionId: version.id, senderName: "Office", senderEmail: "office@example.org", categoryKey: category.categoryKey },
  }));
  assert.strictEqual(created.status, 201, JSON.stringify(created.json));
  const campaignId = created.json.data.id;
  const selfApprove = await call(campaignOne.PATCH, request(`/api/v1/campaigns/${campaignId}`, { method: "PATCH", cookie: admin, body: { action: "approve" } }), { campaignId });
  assert.strictEqual(selfApprove.status, 403, "creator cannot approve");
  const approved = await call(campaignOne.PATCH, request(`/api/v1/campaigns/${campaignId}`, { method: "PATCH", cookie: approver, body: { action: "approve" } }), { campaignId });
  assert.strictEqual(approved.status, 200, JSON.stringify(approved.json));

  // 2. Dispatch returns immediately; the queue does the sending
  const dispatched = await call(campaignOne.PATCH, request(`/api/v1/campaigns/${campaignId}`, { method: "PATCH", cookie: admin, body: { action: "dispatch" } }), { campaignId });
  assert.strictEqual(dispatched.status, 202, JSON.stringify(dispatched.json));
  assert.ok(dispatched.json.data.queued > 0);
  while ((await processQueue(10)).processed > 0) { /* drain */ }

  const recipient = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId, status: "accepted" } });
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: recipient.invitationId } });
  assert.strictEqual(invitation.invitationStatus, "sent");

  // 3. Verified delivery webhook
  const payload = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: recipient.providerMessageId } });
  const id = `msg_e2e_${Date.now()}`;
  const ts = new Date();
  const hook = new Request("http://localhost:3000/api/v1/webhooks/email", {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": String(Math.floor(ts.getTime() / 1000)), "svix-signature": new Webhook(SECRET).sign(id, ts, payload) },
    body: payload,
  });
  assert.strictEqual((await call(webhook.POST, hook)).json.outcome, "processed");
  assert.strictEqual((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).status, "delivered");

  // 4. Guest opens the link and accepts
  const token = await invitationRawToken(invitation);
  const view = await call(publicInv.GET, request(`/api/v1/public/invitations/${token}`), { token });
  assert.strictEqual(view.status, 200);
  const rsvp = await call(publicInv.POST, request(`/api/v1/public/invitations/${token}`, { method: "POST", body: { action: "rsvp", response: "accepted", companionCount: 0 } }), { token });
  assert.strictEqual(rsvp.status, 200, JSON.stringify(rsvp.json));
  assert.match(rsvp.json.data.qrCodeDataUrl, /^data:image\/png/);

  // 5. Usher scans the pass at their gate; a second scan is refused
  const cred = await prisma.qrCredential.findFirstOrThrow({ where: { invitationId: invitation.id, status: "active" } });
  const { decryptSecret } = await import("../../src/lib/crypto.ts");
  const passToken = await decryptSecret(cred.tokenEnc, `qr_credentials.tokenEnc:${cred.id}`);
  assert.ok(await findCredentialByToken(prisma, passToken));
  const gate = await prisma.gate.findFirstOrThrow({ where: { eventId: f.event.id, code: "MAIN" } });
  const body = { eventId: f.event.id, gateId: gate.id, token: passToken, method: "qr" };
  const first = await call(checkin.POST, request("/api/v1/check-in/confirm", { method: "POST", cookie: usher, body }));
  assert.strictEqual(first.status, 200, JSON.stringify(first.json));
  const second = await call(checkin.POST, request("/api/v1/check-in/confirm", { method: "POST", cookie: usher, body }));
  assert.strictEqual(second.status, 409);
  assert.strictEqual(second.json.data.state, "ALREADY_CHECKED_IN");
});
