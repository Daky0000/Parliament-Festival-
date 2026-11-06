import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { emailTrackingForEvent } from "@/lib/email/tracking-summary";

// Live email status per dignitary (sent, delivered, opened, clicked), polled
// by the Guest Directory. Two grouped queries, so it stays cheap.
export const GET = withActor(async (request, { actor }) => {
  const eventId = new URL(request.url).searchParams.get("eventId");
  await authorizeEvent(actor, "guests.read", eventId);
  const map = await emailTrackingForEvent(prisma, eventId!);
  return NextResponse.json({ data: Object.fromEntries(map) }, { headers: { "Cache-Control": "no-store" } });
});
