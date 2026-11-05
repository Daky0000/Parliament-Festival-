import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { notFound } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";

export const GET = withActor(async (request, { actor }) => {
  const eventId = new URL(request.url).searchParams.get("eventId");
  await authorizeEvent(actor, "campaigns.read", eventId);

  const campaigns = await prisma.invitationCampaign.findMany({
    where: { eventId: eventId! },
    include: {
      templateVersion: { include: { template: true } },
      creator: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      _count: { select: { invitations: true, emailAttempts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: campaigns });
});

export const POST = withActor(async (request, { actor }) => {
  const body = await request.json();

  const {
    eventId,
    name,
    templateVersionId,
    senderName,
    senderEmail,
    replyToEmail,
    subjectSnapshot,
    categoryKey,
  } = body;

  const event = await authorizeEvent(actor, "campaigns.create", eventId);
  const version = await prisma.invitationTemplateVersion.findUnique({
    where: { id: String(templateVersionId ?? "") },
    include: { template: true },
  });
  if (!version || version.template.eventId !== event.id) throw notFound();

  if (!name || !senderName || !senderEmail) {
    return NextResponse.json(
      { error: "Missing required fields for campaign creation" },
      { status: 400 }
    );
  }

  // Pre-dispatch Validation: count eligible guests
  const eligibleGuests = await prisma.eventGuest.findMany({
    where: {
      eventId,
      guestStatus: "active",
      ...(categoryKey ? { protocolCategory: { categoryKey } } : {}),
    },
    include: { person: true },
  });

  const validEmailGuests = eligibleGuests.filter((g) => !!g.person.email);

  const campaign = await prisma.invitationCampaign.create({
    data: {
      eventId,
      name,
      templateVersionId,
      senderName,
      senderEmail,
      replyToEmail,
      subjectSnapshot: subjectSnapshot || "Official State Invitation",
      audienceFilter: JSON.stringify({ categoryKey: categoryKey || "all" }),
      audienceCount: validEmailGuests.length,
      status: "pending_approval", // Requires approver sign-off
      createdBy: actor.userId,
    },
    include: {
      templateVersion: true,
    },
  });

  await logAuditEvent({
    organizationId: event.organizationId,
    eventId: event.id,
    actorUserId: actor.userId,
    action: "CAMPAIGN_CREATED",
    entityType: "invitation_campaign",
    entityId: campaign.id,
    afterData: { name, audienceCount: campaign.audienceCount },
  });

  return NextResponse.json({ data: campaign }, { status: 201 });
});

