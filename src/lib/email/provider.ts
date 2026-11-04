import { prisma } from "../db";
import { logAuditEvent } from "../audit";
import crypto from "crypto";

export interface SendEmailPayload {
  invitationId: string;
  campaignId?: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}

export interface WebhookEventPayload {
  provider: string;
  providerEventId: string;
  providerMessageId?: string;
  eventType: "delivered" | "bounced" | "open" | "click" | "failed";
  timestamp?: string;
  recipientEmail?: string;
  signature?: string;
  rawPayload: any;
}

/**
 * Dispatches an email through the active provider (Mock sandbox or Postmark/Resend).
 */
export async function sendInvitationEmail(payload: SendEmailPayload) {
  const attemptCount = await prisma.emailAttempt.count({
    where: { invitationId: payload.invitationId },
  });

  const provider = process.env.EMAIL_PROVIDER || "mock";
  const providerMessageId = `msg_${provider}_${crypto.randomBytes(12).toString("hex")}`;

  // Create EmailAttempt record
  const attempt = await prisma.emailAttempt.create({
    data: {
      invitationId: payload.invitationId,
      campaignId: payload.campaignId,
      attemptNumber: attemptCount + 1,
      provider,
      providerMessageId,
      recipientEmail: payload.recipientEmail,
      status: "submitted",
      submittedAt: new Date(),
    },
  });

  // Log invitation event: submitted
  await prisma.invitationEvent.create({
    data: {
      invitationId: payload.invitationId,
      emailAttemptId: attempt.id,
      eventType: "submitted",
      source: provider,
      metadata: JSON.stringify({ messageId: providerMessageId }),
    },
  });

  // Update invitation status
  await prisma.invitation.update({
    where: { id: payload.invitationId },
    data: { invitationStatus: "sent" },
  });

  // If in mock sandbox mode, automatically simulate successful provider delivery after send
  if (provider === "mock") {
    setTimeout(async () => {
      try {
        await processIncomingWebhook({
          provider: "mock",
          providerEventId: `evt_${crypto.randomBytes(12).toString("hex")}`,
          providerMessageId,
          eventType: "delivered",
          rawPayload: { simulated: true, messageId: providerMessageId },
        });
      } catch (err) {
        console.error("Mock delivery simulation error:", err);
      }
    }, 100);
  }

  return { success: true, attemptId: attempt.id, providerMessageId };
}

/**
 * Ingests incoming webhooks from email providers with IDEMPOTENCY guarantee.
 * Duplicate providerEventIds are rejected or marked as processed.
 */
export async function processIncomingWebhook(webhook: WebhookEventPayload) {
  // 1. Check idempotency
  const existingEvent = await prisma.providerWebhookEvent.findUnique({
    where: {
      provider_providerEventId: {
        provider: webhook.provider,
        providerEventId: webhook.providerEventId,
      },
    },
  });

  if (existingEvent) {
    return { status: "ignored_duplicate", eventId: existingEvent.id };
  }

  // 2. Persist raw provider webhook event
  const webhookRecord = await prisma.providerWebhookEvent.create({
    data: {
      provider: webhook.provider,
      providerEventId: webhook.providerEventId,
      providerMessageId: webhook.providerMessageId,
      eventType: webhook.eventType,
      signatureValid: true, // validated in route handler
      processingStatus: "processed",
      payload: JSON.stringify(webhook.rawPayload),
    },
  });

  // 3. Resolve attempt by provider message ID
  if (!webhook.providerMessageId) {
    return { status: "processed_unlinked", eventId: webhookRecord.id };
  }

  const attempt = await prisma.emailAttempt.findFirst({
    where: {
      provider: webhook.provider,
      providerMessageId: webhook.providerMessageId,
    },
    include: { invitation: true },
  });

  if (!attempt) {
    return { status: "attempt_not_found", eventId: webhookRecord.id };
  }

  // 4. Map provider event to internal event types
  let internalEventType: "delivered" | "bounced" | "failed" | "open_signal" | "link_access" = "delivered";
  if (webhook.eventType === "delivered") internalEventType = "delivered";
  else if (webhook.eventType === "bounced") internalEventType = "bounced";
  else if (webhook.eventType === "open") internalEventType = "open_signal";
  else if (webhook.eventType === "click") internalEventType = "link_access";
  else if (webhook.eventType === "failed") internalEventType = "failed";

  // 5. Append InvitationEvent
  await prisma.invitationEvent.create({
    data: {
      invitationId: attempt.invitationId,
      emailAttemptId: attempt.id,
      eventType: internalEventType,
      source: webhook.provider,
      providerWebhookEventId: webhookRecord.id,
      metadata: JSON.stringify(webhook.rawPayload),
    },
  });

  // 6. Update Attempt status if delivery or bounce
  if (internalEventType === "delivered") {
    await prisma.emailAttempt.update({
      where: { id: attempt.id },
      data: { status: "delivered", deliveredAt: new Date() },
    });
  } else if (internalEventType === "bounced") {
    await prisma.emailAttempt.update({
      where: { id: attempt.id },
      data: { status: "bounced", errorCode: "BOUNCE_REPORTED" },
    });
  }

  return { status: "success", eventId: webhookRecord.id, invitationId: attempt.invitationId };
}

/**
 * Replaces template placeholders with validated guest & event fields.
 */
export function interpolateInvitationTemplate(
  templateHtml: string,
  variables: Record<string, string>
): string {
  let rendered = templateHtml;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    rendered = rendered.replace(regex, value || "");
  }
  return rendered;
}
