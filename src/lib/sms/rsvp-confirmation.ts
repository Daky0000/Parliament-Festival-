import { prisma } from "../db";
import { sendVynfySms, type SmsDispatchResult } from "./vynfy";

// Thank-you SMS sent when a dignitary accepts their invitation. It carries
// what an usher needs to verify them at the gate: rank, seat, the RSVP
// confirmation code and the guest reference (both are searchable in the
// usher portal's "Enter reference").

function eventWhen(startsAt: Date | null): string {
  if (!startsAt) return "";
  const date = startsAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });
  const time = startsAt.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" }).toUpperCase();
  return `${date}, ${time}`;
}

export function rsvpConfirmationText(v: {
  name: string;
  eventName: string;
  when: string;
  venue: string | null;
  rank: string | null;
  seat: string | null;
  confirmationCode: string;
  guestReference: string | null;
  companions: number;
}): string {
  return [
    `Thank you, ${v.name}, for confirming your attendance at the ${v.eventName}${v.when ? `, ${v.when}` : ""}${v.venue ? `, ${v.venue}` : ""}.`,
    `Rank: ${v.rank ?? "Invited guest"}.`,
    `Seat: ${v.seat ?? "to be assigned"}.`,
    v.companions > 0 ? `Companions: ${v.companions}.` : null,
    `Confirmation code: ${v.confirmationCode}.`,
    v.guestReference ? `Guest ref: ${v.guestReference}.` : null,
    `Please show this SMS or your QR pass to the usher on arrival. - Parliament of Ghana Protocol`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Sends the thank-you SMS for an accepted RSVP. Never throws; idempotent per RSVP. */
export async function sendRsvpConfirmationSms(rsvpId: string): Promise<SmsDispatchResult | { skipped: string }> {
  try {
    const rsvp = await prisma.rsvp.findUniqueOrThrow({
      where: { id: rsvpId },
      include: {
        invitation: {
          include: {
            event: true,
            eventGuest: {
              include: {
                person: true,
                protocolCategory: true,
                seatAssignments: { where: { status: { in: ["proposed", "approved"] } }, include: { section: true, seat: true }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (rsvp.response !== "accepted") return { skipped: "not_accepted" };
    const { event, eventGuest: g } = rsvp.invitation;
    if (!g.person.phone) return { skipped: "no_phone" };

    const title = g.person.title && !g.person.fullName.startsWith(g.person.title) ? `${g.person.title} ` : "";
    const a = g.seatAssignments[0];
    const text = rsvpConfirmationText({
      name: `${title}${g.person.fullName}`,
      eventName: event.name,
      when: eventWhen(event.startsAt),
      venue: event.venueName,
      rank: g.protocolCategory ? `Rank ${g.protocolCategory.rankOrder}, ${g.protocolCategory.name}` : null,
      seat: a ? `${a.section.name}${a.seat ? `, ${a.seat.seatCode}` : ""}` : null,
      confirmationCode: rsvp.confirmationReference,
      guestReference: g.guestReference,
      companions: rsvp.companionCount,
    });

    return await sendVynfySms({
      eventId: event.id,
      eventGuestId: g.id,
      invitationId: rsvp.invitationId,
      recipientPhone: g.person.phone,
      messageText: text,
      messageType: "rsvp_confirmation",
      idempotencyKey: `rsvp-confirmation-${rsvp.id}`,
    });
  } catch (err) {
    console.error("RSVP confirmation SMS failed", err);
    return { skipped: "error" };
  }
}
