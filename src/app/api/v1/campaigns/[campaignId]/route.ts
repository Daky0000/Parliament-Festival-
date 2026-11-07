import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { HttpError, notFound, readJson } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";
import { campaignEngagement, campaignProgress, controlCampaign, enqueueCampaign, processQueue } from "@/lib/campaigns/engine";

export const GET = withActor<{ campaignId: string }>(async (_request, { actor, params }) => {
  const campaign = await prisma.invitationCampaign.findUnique({
    where: { id: params.campaignId },
    include: {
      templateVersion: { include: { template: true } },
      creator: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      invitations: {
        include: {
          eventGuest: { include: { person: true, protocolCategory: true } },
          emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
          invitationEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
          rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!campaign) throw notFound();
  await authorizeEvent(actor, "campaigns.read", campaign.eventId);
  return NextResponse.json({
    data: { ...campaign, progress: await campaignProgress(campaign.id), engagement: await campaignEngagement(campaign.id) },
  });
});

const Body = z.object({
  action: z.enum(["approve", "dispatch", "pause", "resume", "cancel", "retry_failed"]),
  approvalNote: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(500).optional(),
});

const PERMISSION = {
  approve: "campaigns.approve",
  dispatch: "campaigns.dispatch",
  pause: "campaigns.dispatch",
  resume: "campaigns.dispatch",
  retry_failed: "campaigns.dispatch",
  cancel: "campaigns.cancel",
} as const;

/**
 * Starts sending right away; the Node server keeps running after the response.
 * The cron service's one-minute tick is the safety net. Skipped in tests so
 * they stay deterministic.
 */
function kickQueue() {
  if (process.env.APP_ENV === "ci") return;
  void processQueue(25).catch((e) => console.error("queue kick failed", e));
}

export const PATCH = withActor<{ campaignId: string }>(async (request, { actor, params }) => {
  const body = Body.parse(await readJson(request));
  const campaign = await prisma.invitationCampaign.findUnique({ where: { id: params.campaignId }, include: { event: true } });
  if (!campaign) throw notFound();
  await authorizeEvent(actor, PERMISSION[body.action], campaign.eventId);
  const audit = (action: string, extra: Record<string, unknown> = {}) =>
    logAuditEvent({
      organizationId: campaign.event.organizationId,
      eventId: campaign.eventId,
      actorUserId: actor.userId,
      action,
      entityType: "invitation_campaign",
      entityId: campaign.id,
      reason: body.reason,
      afterData: extra,
    });

  if (body.action === "approve") {
    // Four-eyes: never by its creator, only while pending. The owner decided
    // (2026-11-07) that a super admin may approve their own campaign; that is
    // recorded as a self-approval in the audit log.
    const selfApproved = campaign.createdBy === actor.userId;
    if (selfApproved && !actor.isSuperAdmin) {
      throw new HttpError(403, "A campaign cannot be approved by the person who created it.");
    }
    if (campaign.status !== "pending_approval") {
      throw new HttpError(409, `Campaign is ${campaign.status}; only pending campaigns can be approved.`);
    }
    const updated = await prisma.invitationCampaign.update({
      where: { id: campaign.id },
      data: { status: "approved", approvedBy: actor.userId, approvedAt: new Date(), approvalNote: body.approvalNote || null },
    });
    await audit(selfApproved ? "CAMPAIGN_SELF_APPROVED" : "CAMPAIGN_APPROVED", { selfApproved });
    return NextResponse.json({ data: updated });
  }

  if (body.action === "dispatch") {
    if (campaign.status !== "approved") {
      throw new HttpError(409, "Campaign must be approved before it can be sent.");
    }
    const counts = await enqueueCampaign(campaign.id);
    await audit("CAMPAIGN_DISPATCHED", counts);
    kickQueue();
    return NextResponse.json({ data: { status: "sending", ...counts, progress: await campaignProgress(campaign.id) } }, { status: 202 });
  }

  const result = await controlCampaign(campaign.id, body.action);
  if (!result.ok) throw new HttpError(409, result.message);
  await audit(`CAMPAIGN_${body.action.toUpperCase()}`);
  if (body.action === "resume" || body.action === "retry_failed") kickQueue();
  return NextResponse.json({ data: { progress: await campaignProgress(campaign.id) } });
});
