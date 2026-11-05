import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { HttpError, notFound } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";
import { issueInvitation, rsvpUrl as buildRsvpUrl } from "@/lib/guest-tokens";
import { sendInvitationEmail } from "@/lib/email/provider";
import { buildInvitationVars, fillTemplate } from "@/lib/email/render-invitation";

export const GET = withActor<{ campaignId: string }>(async (_request, { actor, params }) => {
  const { campaignId } = params;

  const campaign = await prisma.invitationCampaign.findUnique({
    where: { id: campaignId },
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

  return NextResponse.json({ data: campaign });
});

export const PATCH = withActor<{ campaignId: string }>(async (request, { actor, params }) => {
  const { campaignId } = params;
  const user = actor;
  const body = await request.json();
  const { action, approvalNote } = body;

  const campaign = await prisma.invitationCampaign.findUnique({
    where: { id: campaignId },
    include: {
      event: true,
      templateVersion: true,
    },
  });

  if (!campaign) throw notFound();
  if (action !== "approve" && action !== "dispatch") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  await authorizeEvent(actor, action === "approve" ? "campaigns.approve" : "campaigns.dispatch", campaign.eventId);

  // 1. APPROVE CAMPAIGN (four-eyes: never by its creator, only while pending)
  if (action === "approve") {
    if (campaign.createdBy === actor.userId) {
      throw new HttpError(403, "A campaign cannot be approved by the person who created it.");
    }
    if (campaign.status !== "pending_approval") {
      throw new HttpError(409, `Campaign is ${campaign.status}; only pending campaigns can be approved.`);
    }
    const updated = await prisma.invitationCampaign.update({
      where: { id: campaignId },
      data: {
        status: "approved",
        approvedBy: user?.userId,
        approvedAt: new Date(),
        approvalNote: approvalNote || "Approved by Campaign Approver.",
      },
    });

    if (user) {
      await logAuditEvent({
        organizationId: campaign.event.organizationId,
        eventId: campaign.eventId,
        actorUserId: user.userId,
        action: "CAMPAIGN_APPROVED",
        entityType: "invitation_campaign",
        entityId: campaign.id,
      });
    }

    return NextResponse.json({ data: updated });
  }

  // 2. DISPATCH CAMPAIGN
  if (action === "dispatch") {
    if (campaign.status !== "approved") {
      return NextResponse.json(
        { error: "Campaign must be formally approved before dispatch can begin." },
        { status: 400 }
      );
    }

    // Update status to sending
    await prisma.invitationCampaign.update({
      where: { id: campaignId },
      data: { status: "sending", startedAt: new Date() },
    });

    // Parse audience filter
    let categoryKey: string | null = null;
    try {
      const filter = JSON.parse(campaign.audienceFilter);
      if (filter.categoryKey && filter.categoryKey !== "all") {
        categoryKey = filter.categoryKey;
      }
    } catch (e) {}

    const eligibleGuests = await prisma.eventGuest.findMany({
      where: {
        eventId: campaign.eventId,
        guestStatus: "active",
        person: { email: { not: null } },
        ...(categoryKey ? { protocolCategory: { categoryKey } } : {}),
      },
      include: {
        person: true,
        protocolCategory: true,
        institution: true,
      },
    });

    let sentCount = 0;

    for (const guest of eligibleGuests) {
      if (!guest.person.email) continue;

      // Invitation with a fresh link token (hash + encrypted copy stored)
      const { invitation, rawToken } = await issueInvitation(prisma, {
          eventId: campaign.eventId,
          eventGuestId: guest.id,
          campaignId: campaign.id,
          templateVersionId: campaign.templateVersionId,
          tokenExpiresAt: campaign.event.endsAt,
          recipientEmailSnapshot: guest.person.email,
          recipientNameSnapshot: guest.person.fullName,
          designationSnapshot: guest.person.designation,
          institutionSnapshot: guest.institution?.name,
          categorySnapshot: JSON.stringify(guest.protocolCategory || {}),
          invitationStatus: "queued",
      });
      const invitationReference = invitation.invitationReference;
      const rsvpUrl = buildRsvpUrl(rawToken);

      // Interpolate template placeholders
      // Header colour follows the guest's protocol rank (navy when unranked)
      const templateVars = buildInvitationVars(
        {
          title: guest.person.title,
          fullName: guest.person.fullName,
          designation: guest.person.designation,
          institution: guest.institution?.name,
          rankColourHex: guest.protocolCategory?.colourHex,
          rankName: guest.protocolCategory?.name,
          rankOrder: guest.protocolCategory?.rankOrder,
        },
        {
          eventName: campaign.event.name,
          venueName: campaign.event.venueName,
          rsvpUrl,
          reference: invitationReference,
        }
      );

      const renderedHtml = fillTemplate(campaign.templateVersion.htmlContent || "", templateVars, { html: true });
      const renderedText = fillTemplate(campaign.templateVersion.textContent || "", templateVars, { html: false });

      // Send through provider
      await sendInvitationEmail({
        invitationId: invitation.id,
        campaignId: campaign.id,
        recipientEmail: guest.person.email,
        recipientName: guest.person.fullName,
        subject: campaign.subjectSnapshot,
        htmlContent: renderedHtml,
        textContent: renderedText,
      });

      sentCount++;
    }

    // Complete campaign
    const completed = await prisma.invitationCampaign.update({
      where: { id: campaignId },
      data: {
        status: "completed",
        completedAt: new Date(),
        audienceCount: sentCount,
      },
    });

    if (user) {
      await logAuditEvent({
        organizationId: campaign.event.organizationId,
        eventId: campaign.eventId,
        actorUserId: user.userId,
        action: "CAMPAIGN_DISPATCHED",
        entityType: "invitation_campaign",
        entityId: campaign.id,
        afterData: { sentCount },
      });
    }

    return NextResponse.json({
      data: {
        campaign: completed,
        sentCount,
      },
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
});
