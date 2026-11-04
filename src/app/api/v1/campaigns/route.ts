import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { generateSecureToken, generateReferenceCode } from "@/lib/tokens";
import { sendInvitationEmail, interpolateInvitationTemplate } from "@/lib/email/provider";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const campaigns = await prisma.invitationCampaign.findMany({
    where: { eventId },
    include: {
      templateVersion: { include: { template: true } },
      creator: true,
      approver: true,
      _count: { select: { invitations: true, emailAttempts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: campaigns });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
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

  if (!eventId || !name || !templateVersionId || !senderName || !senderEmail) {
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
      createdBy: user?.userId || "system",
    },
    include: {
      templateVersion: true,
    },
  });

  return NextResponse.json({ data: campaign }, { status: 201 });
}

