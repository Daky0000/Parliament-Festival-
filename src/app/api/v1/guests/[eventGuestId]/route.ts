import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { notFound } from "@/lib/http";
import { emailTrackingFor, trackingInvitationInclude } from "@/lib/email/tracking-summary";

// Everything about one dignitary for the Guest Directory detail panel:
// profile, rank, seat, RSVP, check-in, and the full email history (every
// send with its delivery state, and every open / click / RSVP-page visit).
export const GET = withActor<{ eventGuestId: string }>(async (_request, { actor, params }) => {
  const guest = await prisma.eventGuest.findUnique({
    where: { id: params.eventGuestId },
    include: {
      person: true,
      institution: true,
      protocolCategory: true,
      seatAssignments: { where: { status: { in: ["proposed", "approved"] } }, include: { section: true, seat: true } },
      attendanceRecords: { orderBy: { checkedInAt: "desc" }, take: 1, include: { gate: { select: { name: true } } } },
      invitations: {
        orderBy: { createdAt: "desc" },
        include: {
          rsvps: { orderBy: { submittedAt: "desc" } },
          emailAttempts: { orderBy: { attemptNumber: "desc" } },
          invitationEvents: { orderBy: { occurredAt: "desc" }, take: 200 },
        },
      },
    },
  });
  if (!guest) throw notFound();
  await authorizeEvent(actor, "guests.read", guest.eventId);

  const trackingRows = await prisma.invitation.findMany({ where: { eventGuestId: guest.id }, include: trackingInvitationInclude });
  const sends = guest.invitations
    .flatMap((inv) =>
      inv.emailAttempts.map((a) => {
        const evts = inv.invitationEvents.filter((e) => e.emailAttemptId === a.id);
        return {
          id: a.id,
          invitationReference: inv.invitationReference,
          attemptNumber: a.attemptNumber,
          recipientEmail: a.recipientEmail,
          status: a.status,
          via: a.campaignId ? "campaign" : "direct",
          submittedAt: a.submittedAt,
          deliveredAt: a.deliveredAt,
          createdAt: a.createdAt,
          error: a.errorMessage,
          opens: evts.filter((e) => e.eventType === "open_signal").length,
          clicks: evts.filter((e) => e.eventType === "click").length,
        };
      })
    )
    .sort((a, b) => +b.createdAt - +a.createdAt);

  const LABEL: Record<string, string> = {
    submitted: "Email sent",
    delivered: "Delivered to inbox",
    open_signal: "Email opened",
    click: "RSVP button clicked",
    link_access: "RSVP page visited",
    bounced: "Bounced",
    failed: "Send failed",
    deferred: "Delivery delayed",
    rejected: "Rejected",
    complaint: "Marked as spam",
  };
  const activity = guest.invitations
    .flatMap((inv) => inv.invitationEvents.filter((e) => LABEL[e.eventType]).map((e) => ({ id: e.id, type: e.eventType, label: LABEL[e.eventType], at: e.occurredAt, source: e.source })))
    .sort((a, b) => +b.at - +a.at);

  const sms = await prisma.communicationMessage.findMany({
    where: { eventGuestId: guest.id, channel: "sms" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, messageType: true, recipientSnapshot: true, status: true, bodySnippet: true, submittedAt: true, createdAt: true, failureMessageSanitised: true },
  });
  const rsvp = guest.invitations.flatMap((i) => i.rsvps).sort((a, b) => +b.submittedAt - +a.submittedAt)[0] ?? null;
  const seat = guest.seatAssignments[0] ?? null;
  const checkin = guest.attendanceRecords[0] ?? null;

  return NextResponse.json({
    data: {
      id: guest.id,
      guestReference: guest.guestReference,
      title: guest.person.title,
      fullName: guest.person.fullName,
      designation: guest.person.designation,
      institution: guest.institution?.name ?? null,
      email: guest.person.email,
      phone: guest.person.phone,
      companionAllowance: guest.companionAllowance,
      operationalNotes: guest.operationalNotes,
      addedAt: guest.createdAt,
      rank: guest.protocolCategory
        ? { name: guest.protocolCategory.name, order: guest.protocolCategory.rankOrder, colour: guest.protocolCategory.colourHex }
        : null,
      seat: seat ? { section: seat.section.name, seatCode: seat.seat?.seatCode ?? null, status: seat.status } : null,
      invitationReference: guest.invitations[0]?.invitationReference ?? null,
      rsvp: rsvp ? { response: rsvp.response, companions: rsvp.companionCount, at: rsvp.submittedAt, reference: rsvp.confirmationReference } : null,
      checkin: checkin ? { status: checkin.checkinStatus, at: checkin.checkedInAt, gate: checkin.gate?.name ?? null } : null,
      tracking: emailTrackingFor(trackingRows),
      sends,
      activity,
      sms: sms.map((m) => ({
        id: m.id,
        type: m.messageType,
        to: m.recipientSnapshot,
        status: m.status,
        preview: m.bodySnippet,
        at: m.submittedAt ?? m.createdAt,
        error: m.failureMessageSanitised,
      })),
    },
  });
});
