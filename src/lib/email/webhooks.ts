import { prisma } from "../db";

// Verified Resend webhook events -> delivery state. Event names and payload
// fields follow Resend's documentation (type, created_at, data.email_id,
// data.to, data.bounce.type). Processing is idempotent on the svix-id and safe
// against out-of-order delivery: a terminal state is never downgraded.

export type ResendEvent = {
  type: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[]; bounce?: { type?: string; subType?: string; message?: string } };
};

// Higher rank wins; equal or lower ranks never overwrite.
const RANK: Record<string, number> = { queued: 0, failed: 1, submitted: 2, deferred: 3, delivered: 4, bounced: 5, rejected: 5 };

const STATUS_FOR: Record<string, string | undefined> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.failed": "failed",
  "email.suppressed": "rejected",
  "email.delivery_delayed": "deferred",
};

const ENGAGEMENT: Record<string, string> = {
  "email.opened": "open_signal", // a tracked open, not proof a person read it
  "email.clicked": "click",
  "email.complained": "complaint",
};

export type WebhookOutcome = "processed" | "duplicate" | "unlinked" | "ignored";

export async function processResendEvent(svixId: string, event: ResendEvent): Promise<WebhookOutcome> {
  const emailId = event.data?.email_id ?? null;
  const occurredAt = event.created_at ? new Date(event.created_at) : new Date();

  // Idempotency: the same svix-id is stored once.
  const existing = await prisma.providerWebhookEvent.findUnique({
    where: { provider_providerEventId: { provider: "resend", providerEventId: svixId } },
  });
  if (existing) return "duplicate";

  const record = await prisma.providerWebhookEvent
    .create({
      data: {
        provider: "resend",
        providerEventId: svixId,
        providerMessageId: emailId,
        eventType: event.type,
        occurredAt,
        signatureValid: true, // only called after svix verification
        payload: JSON.stringify({ type: event.type, created_at: event.created_at, data: { email_id: emailId, bounce: event.data?.bounce } }),
      },
    })
    .catch((err) => {
      if ((err as { code?: string }).code === "P2002") return null; // concurrent duplicate
      throw err;
    });
  if (!record) return "duplicate";

  const attempt = emailId ? await prisma.emailAttempt.findFirst({ where: { providerMessageId: emailId } }) : null;
  if (!attempt) {
    await prisma.providerWebhookEvent.update({ where: { id: record.id }, data: { processingStatus: "ignored", processingError: "No matching email attempt" } });
    return "unlinked";
  }

  const newStatus = STATUS_FOR[event.type];
  const engagement = ENGAGEMENT[event.type];
  if (!newStatus && !engagement) {
    await prisma.providerWebhookEvent.update({ where: { id: record.id }, data: { processingStatus: "ignored" } });
    return "ignored";
  }

  await prisma.$transaction(async (tx) => {
    await tx.invitationEvent.create({
      data: {
        invitationId: attempt.invitationId,
        emailAttemptId: attempt.id,
        eventType: engagement ?? newStatus!,
        occurredAt,
        source: "resend_webhook",
        providerWebhookEventId: record.id,
      },
    });

    if (newStatus && (RANK[newStatus] ?? 0) > (RANK[attempt.status] ?? 0)) {
      await tx.emailAttempt.update({
        where: { id: attempt.id },
        data: { status: newStatus, ...(newStatus === "delivered" ? { deliveredAt: occurredAt } : {}) },
      });
      await tx.campaignRecipient.updateMany({
        where: { providerMessageId: emailId!, status: { notIn: ["bounced"] } },
        data: { status: newStatus === "deferred" ? "accepted" : newStatus === "rejected" ? "suppressed" : newStatus },
      });
    }

    // Never write to an address again after a permanent bounce or a complaint.
    const permanentBounce = event.type === "email.bounced" && (event.data?.bounce?.type ?? "").toLowerCase() === "permanent";
    if (permanentBounce || event.type === "email.complained") {
      await tx.suppression.upsert({
        where: { channel_address: { channel: "email", address: attempt.recipientEmail.toLowerCase() } },
        update: {},
        create: {
          channel: "email",
          address: attempt.recipientEmail.toLowerCase(),
          reason: permanentBounce ? "hard_bounce" : "complaint",
          source: svixId,
        },
      });
    }
    await tx.providerWebhookEvent.update({ where: { id: record.id }, data: { processingStatus: "processed" } });
  });
  return "processed";
}
