import { can, canAny, type Actor } from "./authz";
import { getCurrentEvent } from "./current-event";
import { SYSTEM_ROLES } from "./roles";
import { navigationItems, type Viewer } from "@/components/layout/nav-items";
import type { Permission } from "./roles";

/** Server-side: what the signed-in user may see in the dashboard chrome. */
export async function buildViewer(actor: Actor): Promise<Viewer> {
  const { event, events } = await getCurrentEvent(actor);
  const order = Object.keys(SYSTEM_ROLES);
  const topRole = [...actor.roleKeys].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  return {
    fullName: actor.fullName,
    roleLabel: topRole ? SYSTEM_ROLES[topRole]?.name ?? topRole : "No role",
    allowedHrefs: event
      ? navigationItems.filter((i) => can(actor, i.permission as Permission, event.id)).map((i) => i.href)
      : [],
    canUsher: canAny(actor, "checkin.scan"),
    canSuperAdmin: can(actor, "platform.manage"),
    event: event && {
      id: event.id,
      name: event.name,
      eventCode: event.eventCode,
      startsAt: event.startsAt ? event.startsAt.toISOString() : null,
      venueName: event.venueName,
    },
    events: events.map((e) => ({ id: e.id, name: e.name })),
  };
}
