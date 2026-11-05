import { cookies } from "next/headers";
import { accessibleEvents, can, type Actor } from "./authz";
import { EVENT_COOKIE } from "./auth-http";
import type { Permission } from "./roles";

/**
 * The event the dashboard works on: the pf_event cookie if it names an event
 * this actor can reach, otherwise the first reachable event.
 */
export async function getCurrentEvent(actor: Actor) {
  const events = await accessibleEvents(actor);
  const wanted = (await cookies()).get(EVENT_COOKIE)?.value;
  return { event: events.find((e) => e.id === wanted) ?? events[0] ?? null, events };
}

/** For pages: the current event, or null when the actor lacks `perm` on it. */
export async function currentEventFor(actor: Actor, perm: Permission) {
  const { event, events } = await getCurrentEvent(actor);
  if (!event || !can(actor, perm, event.id)) return { event: null, events, allowed: false as const };
  return { event, events, allowed: true as const };
}
