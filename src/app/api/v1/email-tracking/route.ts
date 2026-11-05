import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { emailTrackingFor, trackingInvitationInclude } from "@/lib/email/tracking-summary";

// Live email status per dignitary (sent, delivered, opened, clicked), polled
// by the Guest Directory so opens show up without reloading the page.
export const GET = withActor(async (request, { actor }) => {
  const eventId = new URL(request.url).searchParams.get("eventId");
  await authorizeEvent(actor, "guests.read", eventId);
  const guests = await prisma.eventGuest.findMany({
    where: { eventId: eventId!, guestStatus: "active" },
    select: { id: true, invitations: { include: trackingInvitationInclude } },
  });
  return NextResponse.json({ data: Object.fromEntries(guests.map((g) => [g.id, emailTrackingFor(g.invitations)])) });
});
