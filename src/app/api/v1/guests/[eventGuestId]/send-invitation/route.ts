import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { HttpError, notFound } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";
import { issueInvitation, invitationRawToken, rsvpUrl } from "@/lib/guest-tokens";
import { buildInvitationVars, fillTemplate } from "@/lib/email/render-invitation";
import { INVITATION_SUBJECT } from "@/lib/email/invitation-template";
import { sendInvitationEmail } from "@/lib/email/provider";
import { emailTrackingFor, trackingInvitationInclude } from "@/lib/email/tracking-summary";

// Sends the approved invitation template to one dignitary. Nothing in the
// email is editable here: the content is the approved template filled with
// the guest's own record, exactly as a campaign would send it.
const RESEND_COOLDOWN_MS = 30_000;

export const POST = withActor<{ eventGuestId: string }>(async (_request, { actor, params }) => {
  const guest = await prisma.eventGuest.findUnique({
    where: { id: params.eventGuestId },
    include: {
      event: true,
      person: true,
      institution: true,
      protocolCategory: true,
      invitations: {
        where: { tokenRevokedAt: null, invitationStatus: { notIn: ["revoked", "superseded"] } },
        orderBy: { createdAt: "desc" },
        include: { emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 } },
      },
    },
  });
  if (!guest) throw notFound();
  const event = await authorizeEvent(actor, "campaigns.dispatch", guest.eventId);
  if (guest.guestStatus !== "active") throw new HttpError(409, "This dignitary is not active.");

  const email = guest.person.email?.toLowerCase().trim();
  if (!email) throw new HttpError(400, "This dignitary has no email address on record.");
  if (await prisma.suppression.findUnique({ where: { channel_address: { channel: "email", address: email } } })) {
    throw new HttpError(409, "This address bounced or complained before, so it is blocked from further email.");
  }

  const version = await prisma.invitationTemplateVersion.findFirst({
    where: { template: { eventId: guest.eventId }, status: "approved" },
    orderBy: { createdAt: "desc" },
  });
  if (!version?.htmlContent) throw new HttpError(409, "No approved invitation template for this event yet.");

  // Reuse the guest's live invitation (same RSVP link and reference), or issue one.
  let invitation: (typeof guest.invitations)[number] | null = guest.invitations[0] ?? null;
  let rawToken: string | null = invitation ? await invitationRawToken(invitation) : null;
  if (invitation && !rawToken) invitation = null; // legacy row without a re-sendable link
  if (!invitation) {
    const issued = await issueInvitation(prisma, {
      eventId: guest.eventId,
      eventGuestId: guest.id,
      templateVersionId: version.id,
      tokenExpiresAt: guest.event.endsAt,
      recipientEmailSnapshot: email,
      recipientNameSnapshot: [guest.person.title, guest.person.fullName].filter(Boolean).join(" "),
      designationSnapshot: guest.person.designation,
      institutionSnapshot: guest.institution?.name,
      categorySnapshot: JSON.stringify(guest.protocolCategory ? { id: guest.protocolCategory.id, name: guest.protocolCategory.name } : {}),
      invitationStatus: "queued",
    });
    rawToken = issued.rawToken;
    invitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: issued.invitation.id },
      include: { emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 } },
    });
  } else {
    const last = invitation.emailAttempts[0];
    if (last && last.status !== "failed" && Date.now() - +last.createdAt < RESEND_COOLDOWN_MS) {
      throw new HttpError(429, "This invitation was just sent. Please wait a moment before sending again.");
    }
    if (invitation.recipientEmailSnapshot !== email) {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { recipientEmailSnapshot: email } });
    }
  }

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
    { eventName: guest.event.name, venueName: guest.event.venueName, rsvpUrl: rsvpUrl(rawToken!), reference: invitation.invitationReference }
  );

  // The configured, verified sender (RESEND_FROM_EMAIL) wins; a campaign's
  // sender is only a fallback, since it may be on an unverified domain.
  const campaign = process.env.RESEND_FROM_EMAIL
    ? null
    : await prisma.invitationCampaign.findFirst({ where: { eventId: guest.eventId }, orderBy: { createdAt: "desc" } });
  const attemptNumber = (await prisma.emailAttempt.count({ where: { invitationId: invitation.id } })) + 1;

  const result = await sendInvitationEmail({
    invitationId: invitation.id,
    recipientEmail: email,
    recipientName: guest.person.fullName,
    subject: fillTemplate(version.subjectTemplate || INVITATION_SUBJECT, vars, { html: false }),
    htmlContent: fillTemplate(version.htmlContent, vars, { html: true }),
    textContent: fillTemplate(version.textContent || "", vars, { html: false }),
    fromAddress: campaign ? `${campaign.senderName} <${campaign.senderEmail}>` : undefined,
    replyTo: campaign?.replyToEmail,
    idempotencyKey: `single-${invitation.id}-${attemptNumber}`,
  });

  await logAuditEvent({
    organizationId: event.organizationId,
    eventId: event.id,
    actorUserId: actor.userId,
    action: result.ok ? "INVITATION_SENT_SINGLE" : "INVITATION_SEND_FAILED",
    entityType: "event_guest",
    entityId: guest.id,
    afterData: { invitationId: invitation.id, attemptNumber, ...(result.ok ? {} : { code: result.code }) },
  });

  const fresh = await prisma.invitation.findMany({ where: { eventGuestId: guest.id }, include: trackingInvitationInclude });
  const tracking = emailTrackingFor(fresh);
  if (!result.ok) {
    return NextResponse.json({ error: `The email could not be sent: ${result.message}`, tracking }, { status: 502 });
  }
  return NextResponse.json({ data: { invitationReference: invitation.invitationReference, sentTo: email, tracking } });
});
