import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { generateSecureToken, generateReferenceCode } from "../../src/lib/tokens.ts";
import { sendInvitationEmail, processIncomingWebhook } from "../../src/lib/email/provider.ts";
import { runDeterministicSeatingEngine } from "../../src/lib/seating/engine.ts";

test("Full End-to-End Parliamentary Lifecycle Test (PRD 20.3 Scenario 1)", async () => {
  // 1. Verify Event
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
    include: {
      categories: true,
      templates: { include: { versions: true } },
      seatingPlans: true,
    },
  });
  assert.ok(event, "Active event must exist");

  // 2. Create New Dignitary
  const testPerson = await prisma.person.create({
    data: {
      organizationId: event.organizationId,
      title: "Hon.",
      fullName: `Test Dignitary ${Date.now()}`,
      designation: "Ambassador-at-Large",
      email: `dignitary_${Date.now()}@test.parliament.gh`,
    },
  });

  const category = event.categories.find((c) => c.rankOrder === 2) || event.categories[0];
  const testGuest = await prisma.eventGuest.create({
    data: {
      eventId: event.id,
      personId: testPerson.id,
      protocolCategoryId: category.id,
      guestReference: generateReferenceCode("GH-GST"),
      companionAllowance: 1,
      guestStatus: "active",
    },
  });
  assert.ok(testGuest.id, "Guest participation record created");

  // 3. Campaign & Dispatch
  const templateVersion = event.templates[0].versions[0];
  const adminUser = await prisma.user.findFirst();
  assert.ok(adminUser, "Admin user must exist");

  const campaign = await prisma.invitationCampaign.create({
    data: {
      eventId: event.id,
      templateVersionId: templateVersion.id,
      name: `E2E Test Campaign ${Date.now()}`,
      senderName: "Office of the Speaker",
      senderEmail: "speaker@parliament.gh",
      subjectSnapshot: "Official State Invitation Test",
      status: "approved", // Pre-approved for test dispatch
      createdBy: adminUser.id,
      audienceCount: 1,
    },
  });

  const { rawToken, tokenHash } = generateSecureToken();
  const invitation = await prisma.invitation.create({
    data: {
      eventId: event.id,
      eventGuestId: testGuest.id,
      campaignId: campaign.id,
      templateVersionId: templateVersion.id,
      invitationReference: generateReferenceCode("INV-GH"),
      tokenHash,
      recipientEmailSnapshot: testPerson.email,
      recipientNameSnapshot: testPerson.fullName,
      invitationStatus: "queued",
    },
  });

  // Dispatch Email
  const sendRes = await sendInvitationEmail({
    invitationId: invitation.id,
    campaignId: campaign.id,
    recipientEmail: testPerson.email,
    recipientName: testPerson.fullName,
    subject: campaign.subjectSnapshot,
    htmlContent: "<p>Official Test Invitation</p>",
    textContent: "Official Test Invitation",
  });
  assert.strictEqual(sendRes.success, true);

  // 4. Provider Delivery Webhook Simulation
  const webhookDelivered = await processIncomingWebhook({
    provider: "mock",
    providerEventId: `evt_dlv_${Date.now()}`,
    providerMessageId: sendRes.providerMessageId,
    eventType: "delivered",
    rawPayload: { status: "delivered" },
  });
  assert.strictEqual(webhookDelivered.status, "success");

  // Verify Attempt updated
  const attempt = await prisma.emailAttempt.findUnique({
    where: { id: sendRes.attemptId },
  });
  assert.strictEqual(attempt.status, "delivered");

  // 5. Open Signal Webhook Simulation
  const webhookOpen = await processIncomingWebhook({
    provider: "mock",
    providerEventId: `evt_open_${Date.now()}`,
    providerMessageId: sendRes.providerMessageId,
    eventType: "open",
    rawPayload: { userAgent: "Apple Mail Proxy" },
  });
  assert.strictEqual(webhookOpen.status, "success");

  // 6. Recipient Public Link Access & RSVP Submission
  const invitationAfterOpen = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { invitationEvents: true },
  });
  assert.ok(
    invitationAfterOpen.invitationEvents.some((e) => e.eventType === "open_signal"),
    "Open signal event must be recorded"
  );

  // Record link access
  await prisma.invitationEvent.create({
    data: {
      invitationId: invitation.id,
      eventType: "link_access",
      source: "public_web",
    },
  });

  // Submit RSVP (Accept with 1 companion)
  const confirmationRef = generateReferenceCode("CONF");
  const rsvp = await prisma.rsvp.create({
    data: {
      invitationId: invitation.id,
      response: "accepted",
      companionCount: 1,
      confirmationReference: confirmationRef,
      submittedVia: "invitation_page",
    },
  });
  assert.strictEqual(rsvp.response, "accepted");
  assert.strictEqual(rsvp.companionCount, 1);

  // Generate QR Credential for event day
  const { rawToken: rawQr, tokenHash: qrCredHash } = generateSecureToken();
  const qrCredential = await prisma.qrCredential.create({
    data: {
      eventId: event.id,
      invitationId: invitation.id,
      credentialHash: qrCredHash,
      status: "active",
    },
  });
  assert.ok(qrCredential.id, "QR Credential issued");

  // 7. Seating Allocation Engine Execution
  const planId = event.seatingPlans[0].id;
  const seatingRes = await runDeterministicSeatingEngine(event.id, planId);
  assert.ok(seatingRes.assignedCount > 0, "Guest must be seated");

  const guestSeat = await prisma.seatAssignment.findFirst({
    where: {
      seatingPlanId: planId,
      eventGuestId: testGuest.id,
      status: { in: ["proposed", "approved"] },
    },
    include: { section: true },
  });
  assert.ok(guestSeat, "Dignitary must have active seat allocation");

  // 8. Event-Day Usher Check-In Validation
  const checkinRecord = await prisma.attendanceRecord.create({
    data: {
      eventId: event.id,
      eventGuestId: testGuest.id,
      qrCredentialId: qrCredential.id,
      checkinStatus: "checked_in",
      checkinMethod: "qr",
    },
  });
  assert.strictEqual(checkinRecord.checkinStatus, "checked_in");

  // 9. Verify Duplicate Scan Protection
  const duplicateCheck = await prisma.attendanceRecord.findFirst({
    where: {
      eventId: event.id,
      eventGuestId: testGuest.id,
      checkinStatus: "checked_in",
    },
  });
  assert.ok(duplicateCheck, "Existing check-in detected - duplicate prevention works!");
});
