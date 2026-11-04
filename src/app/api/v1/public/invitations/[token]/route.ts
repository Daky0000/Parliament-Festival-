import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken, generateReferenceCode, generateSecureToken, generateQrCodeDataUrl } from "@/lib/tokens";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const tokenHash = hashToken(token);

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      event: true,
      eventGuest: {
        include: {
          person: true,
          institution: true,
          protocolCategory: true,
        },
      },
      rsvps: {
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "Invalid, expired, or revoked invitation token." },
      { status: 404 }
    );
  }

  // Record link access event
  await prisma.invitationEvent.create({
    data: {
      invitationId: invitation.id,
      eventType: "link_access",
      source: "public_web",
      userAgent: request.headers.get("user-agent") || undefined,
    },
  });

  const latestRsvp = invitation.rsvps[0];

  return NextResponse.json({
    data: {
      invitationReference: invitation.invitationReference,
      eventName: invitation.event.name,
      eventVenue: invitation.event.venueName,
      eventAddress: invitation.event.venueAddress,
      eventStartsAt: invitation.event.startsAt,
      rsvpDeadline: invitation.event.rsvpDeadline,
      guestTitle: invitation.eventGuest.person.title,
      guestFullName: invitation.recipientNameSnapshot,
      designation: invitation.designationSnapshot,
      institution: invitation.institutionSnapshot,
      protocolCategory: invitation.eventGuest.protocolCategory?.name,
      companionAllowance: invitation.eventGuest.companionAllowance,
      currentRsvp: latestRsvp
        ? {
            response: latestRsvp.response,
            companionCount: latestRsvp.companionCount,
            confirmationReference: latestRsvp.confirmationReference,
            submittedAt: latestRsvp.submittedAt,
          }
        : null,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const tokenHash = hashToken(token);
  const body = await request.json();
  const { response, companionCount = 0, notes } = body;

  if (!response || !["accepted", "declined"].includes(response)) {
    return NextResponse.json(
      { error: "Valid response ('accepted' or 'declined') is required." },
      { status: 400 }
    );
  }

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      event: true,
      eventGuest: true,
      rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "Invalid, expired, or revoked invitation token." },
      { status: 404 }
    );
  }

  // Validate companion allowance
  const requestedCompanions = Number(companionCount) || 0;
  if (requestedCompanions > invitation.eventGuest.companionAllowance) {
    return NextResponse.json(
      {
        error: `Companion count (${requestedCompanions}) exceeds your authorized allowance (${invitation.eventGuest.companionAllowance}).`,
      },
      { status: 400 }
    );
  }

  const previousRsvp = invitation.rsvps[0];
  const confirmationReference = generateReferenceCode("CONF");

  // Create append-only RSVP record
  const rsvp = await prisma.rsvp.create({
    data: {
      invitationId: invitation.id,
      response,
      companionCount: response === "accepted" ? requestedCompanions : 0,
      submittedVia: "invitation_page",
      confirmationReference,
      notes,
      supersedesRsvpId: previousRsvp?.id,
    },
  });

  let qrCodeDataUrl: string | null = null;
  let credentialHash: string | null = null;

  // If response is accepted, issue secure QR credential
  if (response === "accepted") {
    const { tokenHash: credHash } = generateSecureToken();
    credentialHash = credHash;

    await prisma.qrCredential.create({
      data: {
        eventId: invitation.eventId,
        invitationId: invitation.id,
        credentialHash: credHash,
        status: "active",
        expiresAt: invitation.event.endsAt,
      },
    });

    // Generate QR Code data URL containing the opaque credential hash
    qrCodeDataUrl = await generateQrCodeDataUrl(credHash);
  }

  return NextResponse.json({
    data: {
      confirmationReference,
      response: rsvp.response,
      companionCount: rsvp.companionCount,
      submittedAt: rsvp.submittedAt,
      qrCodeDataUrl,
      credentialHash,
    },
  });
}
