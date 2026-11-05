// Phase 3: durable, idempotent campaign processing.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { enqueueCampaign, processQueue, controlCampaign, campaignProgress, MAX_ATTEMPTS } from "../../src/lib/campaigns/engine.ts";
import { seededFixtures } from "../helpers.mjs";

async function campaignWithGuests(n) {
  const f = await seededFixtures();
  const event = await prisma.event.create({
    data: { organizationId: f.event.organizationId, eventCode: `Q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "Queue test", status: "active" },
  });
  const template = await prisma.invitationTemplate.create({ data: { eventId: event.id, name: "t" } });
  const templateVersionId = (
    await prisma.invitationTemplateVersion.create({
      data: { templateId: template.id, versionNumber: 1, subjectTemplate: "s", htmlContent: "<p>{{guest.full_name}} {{invitation.rsvp_url}}</p>", textContent: "{{invitation.rsvp_url}}", status: "approved" },
    })
  ).id;
  for (let i = 0; i < n; i++) {
    const person = await prisma.person.create({ data: { organizationId: f.event.organizationId, fullName: `Q Guest ${i}`, email: `q${i}-${event.id}@example.org` } });
    await prisma.eventGuest.create({ data: { eventId: event.id, personId: person.id, guestReference: `Q-${event.id.slice(0, 8)}-${i}`, guestStatus: "active" } });
  }
  const campaign = await prisma.invitationCampaign.create({
    data: { eventId: event.id, templateVersionId, name: "Q", senderName: "Office", senderEmail: "office@example.org", subjectSnapshot: "Invitation", status: "approved", createdBy: f.usher.id },
  });
  return { campaign, event };
}

test("dispatch queues every eligible guest once; processing sends each exactly once", async () => {
  const { campaign } = await campaignWithGuests(5);
  const counts = await enqueueCampaign(campaign.id);
  assert.strictEqual(counts.queued, 5);
  // Re-dispatching cannot create duplicates.
  await enqueueCampaign(campaign.id);
  assert.strictEqual(await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } }), 5);

  while ((await processQueue(2)).processed > 0) { /* drain */ }
  const progress = await campaignProgress(campaign.id);
  assert.strictEqual(progress.accepted, 5, JSON.stringify(progress));
  assert.strictEqual(await prisma.emailAttempt.count({ where: { campaignId: campaign.id } }), 5);
  assert.strictEqual(await prisma.invitation.count({ where: { campaignId: campaign.id } }), 5);
  assert.strictEqual((await prisma.invitationCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, "completed");
  // A further tick does nothing.
  await processQueue(10);
  assert.strictEqual(await prisma.emailAttempt.count({ where: { campaignId: campaign.id } }), 5);
});

test("a crashed worker's rows are picked up after the lease, without duplicating invitations", async () => {
  const { campaign } = await campaignWithGuests(2);
  await enqueueCampaign(campaign.id);
  // Simulate a worker that claimed a row and died.
  const row = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } });
  await prisma.campaignRecipient.update({ where: { id: row.id }, data: { status: "processing", lockedUntil: new Date(Date.now() - 1000), attempts: 1 } });
  while ((await processQueue(5)).processed > 0) { /* drain */ }
  assert.strictEqual((await campaignProgress(campaign.id)).accepted, 2);
  assert.strictEqual(await prisma.invitation.count({ where: { campaignId: campaign.id } }), 2);
});

test("pause holds sending; cancel stops unsent recipients", async () => {
  const { campaign } = await campaignWithGuests(3);
  await enqueueCampaign(campaign.id);
  assert.ok((await controlCampaign(campaign.id, "pause")).ok);
  assert.strictEqual((await processQueue(10)).processed, 0, "paused campaigns are not processed");
  assert.ok((await controlCampaign(campaign.id, "cancel")).ok);
  const progress = await campaignProgress(campaign.id);
  assert.strictEqual(progress.cancelled, 3);
  assert.strictEqual(progress.accepted, 0);
  assert.strictEqual((await controlCampaign(campaign.id, "resume")).ok, false, "cancelled is final");
});

test("transient provider failures back off and end in failed after the attempt limit", async () => {
  const { campaign } = await campaignWithGuests(1);
  await enqueueCampaign(campaign.id);
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "down" }), { status: 503 });
  try {
    await processQueue(5);
    let row = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } });
    assert.strictEqual(row.status, "queued");
    assert.ok(row.nextAttemptAt > new Date(), "retry is scheduled in the future");
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await prisma.campaignRecipient.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await processQueue(5);
    }
    row = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } });
    assert.strictEqual(row.status, "failed");
    assert.strictEqual(row.attempts, MAX_ATTEMPTS);
    assert.strictEqual(row.lastErrorCode, "http_503");
  } finally {
    globalThis.fetch = original;
    process.env.EMAIL_PROVIDER = "mock";
    process.env.RESEND_API_KEY = "";
  }
  // Recover: retry_failed re-queues and a healthy provider completes it.
  assert.ok((await controlCampaign(campaign.id, "retry_failed")).ok);
  await processQueue(5);
  assert.strictEqual((await campaignProgress(campaign.id)).accepted, 1);
});

test("suppressed addresses are never sent to", async () => {
  const { campaign, event } = await campaignWithGuests(2);
  const guest = await prisma.eventGuest.findFirstOrThrow({ where: { eventId: event.id }, include: { person: true } });
  await prisma.suppression.create({ data: { channel: "email", address: guest.person.email.toLowerCase(), reason: "hard_bounce" } });
  const counts = await enqueueCampaign(campaign.id);
  assert.strictEqual(counts.suppressed, 1);
  while ((await processQueue(5)).processed > 0) { /* drain */ }
  assert.strictEqual((await campaignProgress(campaign.id)).accepted, 1);
  assert.strictEqual(await prisma.emailAttempt.count({ where: { campaignId: campaign.id, recipientEmail: guest.person.email.toLowerCase() } }), 0);
});
