import { prisma } from "../db";
import { issueInvitation, rsvpUrl } from "../guest-tokens";
import { buildInvitationVars, fillTemplate } from "../email/render-invitation";
import { sendInvitationEmail } from "../email/provider";

// Durable campaign sending. The database is the queue:
// - dispatch creates one CampaignRecipient row per eligible guest (unique per
//   campaign + guest + channel) and returns immediately;
// - processQueue() claims due rows with a 5-minute lease using
//   FOR UPDATE SKIP LOCKED, so parallel workers never take the same row and a
//   crashed worker's rows are picked up again after the lease;
// - the recipient row id is the provider Idempotency-Key, so a retry after a
//   crash can never send twice;
// - transient failures back off exponentially with jitter; permanent ones and
//   rows past MAX_ATTEMPTS end as "failed" (dead letter) for manual review.
// Runs from a Cloudflare Cron Trigger every minute and is kicked right after
// dispatch.

export const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 300;
const ACTIVE = ["queued", "processing"];

export function backoffMs(attempt: number): number {
  const base = Math.min(30_000 * 2 ** (attempt - 1), 30 * 60_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/** Creates the recipient rows for an approved campaign and starts sending. */
export async function enqueueCampaign(campaignId: string): Promise<{ queued: number; suppressed: number; skippedNoEmail: number }> {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.invitationCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    const filter = JSON.parse(campaign.audienceFilter || "{}") as { categoryKey?: string };
    const guests = await tx.eventGuest.findMany({
      where: {
        eventId: campaign.eventId,
        guestStatus: "active",
        ...(filter.categoryKey && filter.categoryKey !== "all" ? { protocolCategory: { categoryKey: filter.categoryKey } } : {}),
      },
      include: { person: true },
    });
    const withEmail = guests.filter((g) => g.person.email);
    const suppressedSet = new Set(
      (
        await tx.suppression.findMany({
          where: { channel: "email", address: { in: withEmail.map((g) => g.person.email!.toLowerCase()) } },
        })
      ).map((s) => s.address)
    );
    const rows = withEmail.map((g) => ({
      campaignId,
      eventGuestId: g.id,
      channel: "email",
      status: suppressedSet.has(g.person.email!.toLowerCase()) ? "suppressed" : "queued",
    }));
    await tx.campaignRecipient.createMany({ data: rows, skipDuplicates: true });
    await tx.invitationCampaign.update({
      where: { id: campaignId },
      data: { status: "sending", startedAt: campaign.startedAt ?? new Date(), audienceCount: rows.length },
    });
    return {
      queued: rows.filter((r) => r.status === "queued").length,
      suppressed: rows.filter((r) => r.status === "suppressed").length,
      skippedNoEmail: guests.length - withEmail.length,
    };
  });
}

type Claimed = { id: string; campaignId: string; eventGuestId: string; attempts: number; invitationId: string | null };

async function claim(limit: number): Promise<Claimed[]> {
  return prisma.$queryRaw<Claimed[]>`
    UPDATE "campaign_recipients" AS r
    SET "status" = 'processing',
        "lockedUntil" = NOW() + make_interval(secs => ${LEASE_SECONDS}),
        "attempts" = r."attempts" + 1,
        "updatedAt" = NOW()
    WHERE r."id" IN (
      SELECT q."id" FROM "campaign_recipients" q
      JOIN "invitation_campaigns" c ON c."id" = q."campaignId"
      WHERE c."status" = 'sending'
        AND ((q."status" = 'queued' AND q."nextAttemptAt" <= NOW())
          OR (q."status" = 'processing' AND q."lockedUntil" < NOW()))
      ORDER BY q."nextAttemptAt"
      LIMIT ${limit}
      FOR UPDATE OF q SKIP LOCKED
    )
    RETURNING r."id", r."campaignId", r."eventGuestId", r."attempts", r."invitationId"`;
}

async function sendOne(row: Claimed): Promise<void> {
  const campaign = await prisma.invitationCampaign.findUniqueOrThrow({
    where: { id: row.campaignId },
    include: { event: true, templateVersion: true },
  });
  const guest = await prisma.eventGuest.findUniqueOrThrow({
    where: { id: row.eventGuestId },
    include: { person: true, institution: true, protocolCategory: true },
  });
  const email = guest.person.email?.toLowerCase();
  if (!email) {
    await prisma.campaignRecipient.update({ where: { id: row.id }, data: { status: "failed", lastErrorCode: "no_email", lockedUntil: null } });
    return;
  }
  if (await prisma.suppression.findUnique({ where: { channel_address: { channel: "email", address: email } } })) {
    await prisma.campaignRecipient.update({ where: { id: row.id }, data: { status: "suppressed", lockedUntil: null } });
    return;
  }

  // One invitation per recipient row, created once and reused on retries.
  let invitationId = row.invitationId;
  let rawToken: string;
  if (!invitationId) {
    const issued = await issueInvitation(prisma, {
      eventId: campaign.eventId,
      eventGuestId: guest.id,
      campaignId: campaign.id,
      templateVersionId: campaign.templateVersionId,
      tokenExpiresAt: campaign.event.endsAt,
      recipientEmailSnapshot: email,
      recipientNameSnapshot: guest.person.fullName,
      designationSnapshot: guest.person.designation,
      institutionSnapshot: guest.institution?.name,
      categorySnapshot: JSON.stringify(guest.protocolCategory ? { id: guest.protocolCategory.id, name: guest.protocolCategory.name } : {}),
      invitationStatus: "queued",
    });
    invitationId = issued.invitation.id;
    rawToken = issued.rawToken;
    await prisma.campaignRecipient.update({ where: { id: row.id }, data: { invitationId } });
  } else {
    const inv = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
    const { invitationRawToken } = await import("../guest-tokens");
    rawToken = (await invitationRawToken(inv))!;
  }
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });

  const vars = buildInvitationVars(
    {
      title: guest.person.title,
      fullName: guest.person.fullName,
      designation: guest.person.designation,
      institution: guest.institution?.name,
      rankColourHex: guest.protocolCategory?.colourHex,
      rankName: guest.protocolCategory?.name,
      rankOrder: guest.protocolCategory?.rankOrder,
    },
    { eventName: campaign.event.name, venueName: campaign.event.venueName, rsvpUrl: rsvpUrl(rawToken), reference: invitation.invitationReference }
  );

  const result = await sendInvitationEmail({
    invitationId,
    campaignId: campaign.id,
    recipientEmail: email,
    recipientName: guest.person.fullName,
    subject: campaign.subjectSnapshot,
    htmlContent: fillTemplate(campaign.templateVersion.htmlContent || "", vars, { html: true }),
    textContent: fillTemplate(campaign.templateVersion.textContent || "", vars, { html: false }),
    fromAddress: `${campaign.senderName} <${campaign.senderEmail}>`,
    replyTo: campaign.replyToEmail,
    idempotencyKey: row.id,
  });

  if (result.ok) {
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: { status: "accepted", providerMessageId: result.providerMessageId, lockedUntil: null, lastError: null, lastErrorCode: null },
    });
  } else if (result.retryable && row.attempts < MAX_ATTEMPTS) {
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: {
        status: "queued",
        nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts)),
        lockedUntil: null,
        lastErrorCode: result.code,
        lastError: result.message,
      },
    });
  } else {
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: { status: "failed", lockedUntil: null, lastErrorCode: result.code, lastError: result.message },
    });
  }
}

/** Marks sending campaigns with nothing left in flight as completed. */
async function completeFinished(): Promise<void> {
  const sending = await prisma.invitationCampaign.findMany({ where: { status: "sending" }, select: { id: true } });
  for (const c of sending) {
    const inFlight = await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: { in: ACTIVE } } });
    if (inFlight === 0) {
      await prisma.invitationCampaign.updateMany({ where: { id: c.id, status: "sending" }, data: { status: "completed", completedAt: new Date() } });
    }
  }
}

/** Processes up to `limit` due recipients. Safe to run concurrently and repeatedly. */
export async function processQueue(limit = 25): Promise<{ processed: number }> {
  const rows = await claim(limit);
  for (const row of rows) {
    try {
      await sendOne(row);
    } catch (err) {
      console.error("campaign send failed", row.id, err);
      await prisma.campaignRecipient.update({
        where: { id: row.id },
        data:
          row.attempts < MAX_ATTEMPTS
            ? { status: "queued", nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts)), lockedUntil: null, lastErrorCode: "internal", lastError: "Internal error" }
            : { status: "failed", lockedUntil: null, lastErrorCode: "internal", lastError: "Internal error" },
      });
    }
  }
  await completeFinished();
  return { processed: rows.length };
}

export async function campaignProgress(campaignId: string): Promise<Record<string, number>> {
  const groups = await prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } });
  const out: Record<string, number> = { queued: 0, processing: 0, accepted: 0, delivered: 0, bounced: 0, failed: 0, suppressed: 0, cancelled: 0 };
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

/** Campaign controls. Cancel stops every recipient not yet claimed. */
export async function controlCampaign(campaignId: string, action: "pause" | "resume" | "cancel" | "retry_failed") {
  const campaign = await prisma.invitationCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  const allowed: Record<string, string[]> = {
    pause: ["sending"],
    resume: ["paused"],
    cancel: ["sending", "paused", "approved", "pending_approval"],
    retry_failed: ["completed", "sending", "paused"],
  };
  if (!allowed[action].includes(campaign.status)) {
    return { ok: false as const, message: `Cannot ${action.replace("_", " ")} a campaign that is ${campaign.status}.` };
  }
  return prisma.$transaction(async (tx) => {
    if (action === "pause") await tx.invitationCampaign.update({ where: { id: campaignId }, data: { status: "paused" } });
    if (action === "resume") await tx.invitationCampaign.update({ where: { id: campaignId }, data: { status: "sending" } });
    if (action === "cancel") {
      await tx.invitationCampaign.update({ where: { id: campaignId }, data: { status: "cancelled", completedAt: new Date() } });
      await tx.campaignRecipient.updateMany({ where: { campaignId, status: "queued" }, data: { status: "cancelled" } });
    }
    if (action === "retry_failed") {
      const r = await tx.campaignRecipient.updateMany({
        where: { campaignId, status: "failed", lastErrorCode: { notIn: ["no_email"] } },
        data: { status: "queued", attempts: 0, nextAttemptAt: new Date() },
      });
      if (r.count > 0) await tx.invitationCampaign.update({ where: { id: campaignId }, data: { status: "sending", completedAt: null } });
    }
    return { ok: true as const };
  });
}
