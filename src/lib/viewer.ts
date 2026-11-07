import { can, canAny, type Actor } from "./authz";
import { getCurrentEvent } from "./current-event";
import { SYSTEM_ROLES } from "./roles";
import { navigationItems, type Viewer } from "@/components/layout/nav-items";
import type { Permission } from "./roles";
import { prisma } from "./db";

/** Dashboard menu hrefs a super admin has hidden from other users of this organization. */
export async function getHiddenNavHrefs(organizationId: string): Promise<string[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { hiddenNavHrefs: true },
  });
  return org?.hiddenNavHrefs ?? [];
}

/** Server-side: what the signed-in user may see in the dashboard chrome. */
export async function buildViewer(actor: Actor): Promise<Viewer> {
  const { event, events } = await getCurrentEvent(actor);
  const order = Object.keys(SYSTEM_ROLES);
  const topRole = [...actor.roleKeys].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  const canSuperAdmin = can(actor, "platform.manage");
  const hiddenHrefs = await getHiddenNavHrefs(actor.organizationId);
  return {
    fullName: actor.fullName,
    roleLabel: topRole ? SYSTEM_ROLES[topRole]?.name ?? topRole : "No role",
    allowedHrefs: event
      ? navigationItems
          .filter((i) => can(actor, i.permission as Permission, event.id))
          .filter((i) => canSuperAdmin || !hiddenHrefs.includes(i.href))
          .map((i) => i.href)
      : [],
    hiddenHrefs: canSuperAdmin ? hiddenHrefs : [],
    canUsher: canAny(actor, "checkin.scan"),
    canSuperAdmin,
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
