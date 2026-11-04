import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { generateSecureToken, generateReferenceCode } from "@/lib/tokens";
import { sendInvitationEmail, interpolateInvitationTemplate } from "@/lib/email/provider";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await context.params;

  const campaign = await prisma.invitationCampaign.findUnique({
    where: { id: campaignId },
    include: {
      templateVersion: { include: { template: true } },
      creator: true,
      approver: true,
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

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ data: campaign });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await context.params;
  const user = await getCurrentUser();
  const body = await request.json();
  const { action, approvalNote } = body;

  const campaign = await prisma.invitationCampaign.findUnique({
    where: { id: campaignId },
    include: {
      event: true,
      templateVersion: true,
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // 1. APPROVE CAMPAIGN
  if (action === "approve") {
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    let sentCount = 0;

    for (const guest of eligibleGuests) {
      if (!guest.person.email) continue;

      // Generate cryptographically unpredictable token
      const { rawToken, tokenHash } = generateSecureToken();
      const invitationReference = generateReferenceCode("INV-GH");
      const rsvpUrl = `${appUrl}/public/v1/invitations/${rawToken}`;

      // Create Invitation record
      const invitation = await prisma.invitation.create({
        data: {
          eventId: campaign.eventId,
          eventGuestId: guest.id,
          campaignId: campaign.id,
          templateVersionId: campaign.templateVersionId,
          invitationReference,
          tokenHash,
          tokenExpiresAt: campaign.event.rsvpDeadline,
          recipientEmailSnapshot: guest.person.email,
          recipientNameSnapshot: guest.person.fullName,
          designationSnapshot: guest.person.designation,
          institutionSnapshot: guest.institution?.name,
          categorySnapshot: JSON.stringify(guest.protocolCategory || {}),
          invitationStatus: "queued",
        },
      });

      // Interpolate template placeholders
      const templateVars = {
        "event.name": campaign.event.name,
        "event.venue_name": campaign.event.venueName || "Parliament House",
        "guest.title": guest.person.title || "",
        "guest.full_name": guest.person.fullName,
        "guest.designation": guest.person.designation || "",
        "guest.institution_name": guest.institution?.name || "",
        "invitation.rsvp_url": rsvpUrl,
        "invitation.reference": invitationReference,
      };

      const renderedHtml = interpolateInvitationTemplate(
        campaign.templateVersion.htmlContent || "",
        templateVars
      );
      const renderedText = interpolateInvitationTemplate(
        campaign.templateVersion.textContent || "",
        templateVars
      );

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
}

