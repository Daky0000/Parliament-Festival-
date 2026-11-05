import { NextResponse } from "next/server";
import { withActor, authorizeEvent } from "@/lib/authz";
import { lookupGuests } from "@/lib/checkin";

// Manual fallback search for ushers: limited fields, one event, max 10 rows.
export const GET = withActor(async (request, { actor }) => {
  const url = new URL(request.url);
  const event = await authorizeEvent(actor, "checkin.scan", url.searchParams.get("eventId"));
  return NextResponse.json({ data: await lookupGuests(event.id, url.searchParams.get("q") ?? "") });
});
