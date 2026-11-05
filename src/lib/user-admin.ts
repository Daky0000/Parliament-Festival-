import { prisma } from "./db";
import { can, type Actor } from "./authz";
import { HttpError, forbidden, notFound } from "./http";
import { SYSTEM_ROLES } from "./roles";

// Rules for granting roles, so user administration cannot escalate privilege:
// - the role and any event must be in the actor's organization;
// - only a super admin may grant admin or super_admin;
// - otherwise the role's permissions must be a subset of the actor's own
//   global permissions.

export async function roleIdFor(organizationId: string, roleKey: string): Promise<string> {
  const role = await prisma.role.findUnique({ where: { organizationId_key: { organizationId, key: roleKey } } });
  if (!role) throw new HttpError(400, "Unknown role");
  return role.id;
}

export async function assertCanGrant(actor: Actor, roleKey: string, eventId: string | null): Promise<void> {
  const def = SYSTEM_ROLES[roleKey];
  if (!def) throw new HttpError(400, "Unknown role");
  if ((roleKey === "admin" || roleKey === "super_admin") && !actor.isSuperAdmin) {
    throw new HttpError(403, "Only a super admin can grant administrator roles.");
  }
  if (roleKey === "super_admin" && eventId) throw new HttpError(400, "Super admin cannot be scoped to an event.");
  if (!actor.isSuperAdmin) {
    const missing = def.permissions.filter((p) => !can(actor, p));
    if (missing.length) throw new HttpError(403, "You cannot grant a role with permissions you do not hold.");
  }
  if (eventId) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.organizationId !== actor.organizationId) throw notFound();
  }
}

/** Loads a user in the actor's org; never the actor themselves for privileged changes. */
export async function loadTargetUser(actor: Actor, userId: string, opts: { allowSelf?: boolean } = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roleAssignments: { where: { revokedAt: null }, include: { role: true } } },
  });
  if (!user || user.organizationId !== actor.organizationId) throw notFound();
  if (!opts.allowSelf && user.id === actor.userId) throw new HttpError(403, "You cannot change your own access.");
  // Only super admins may act on administrator accounts.
  const targetPrivileged = user.roleAssignments.some((a) => a.role.key === "admin" || a.role.key === "super_admin");
  if (targetPrivileged && !actor.isSuperAdmin) throw forbidden();
  return user;
}
