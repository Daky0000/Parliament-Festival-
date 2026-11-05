import { NextResponse } from "next/server";
import { z } from "zod";
import { withActor, authorizeEvent, accessibleEvents, readCookie } from "@/lib/authz";
import { readJson } from "@/lib/http";
import { EVENT_COOKIE } from "@/lib/auth-http";
import { sessionCookieOptions } from "@/lib/session";

// Current-event selection for the dashboard. The cookie is only a preference:
// every request still authorizes the event server-side.
export const GET = withActor(async (req, { actor }) => {
  const events = await accessibleEvents(actor);
  const wanted = readCookie(req, EVENT_COOKIE);
  const current = events.find((e) => e.id === wanted) ?? events[0] ?? null;
  return NextResponse.json({
    current: current && { id: current.id, name: current.name, eventCode: current.eventCode },
    events: events.map((e) => ({ id: e.id, name: e.name, eventCode: e.eventCode })),
  });
});

const Body = z.object({ eventId: z.string().min(1) });

export const POST = withActor(async (req, { actor }) => {
  const { eventId } = Body.parse(await readJson(req));
  await authorizeEvent(actor, "events.read", eventId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(EVENT_COOKIE, eventId, sessionCookieOptions());
  return res;
});
