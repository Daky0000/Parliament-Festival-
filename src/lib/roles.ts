// Single source of truth for permissions and system roles. Used by the seed,
// scripts/create-admin.ts and tests. Safe to run repeatedly.
import type { PrismaClient } from "@prisma/client";

export const PERMISSIONS = [
  "platform.manage", "integrations.manage",
  "users.read", "users.create", "users.update", "users.suspend",
  "events.create", "events.read", "events.update", "events.archive",
  "guests.read", "guests.create", "guests.update", "guests.archive", "guests.import", "guests.export",
  "protocol.read", "protocol.configure", "protocol.override",
  "campaigns.read", "campaigns.create", "campaigns.update", "campaigns.approve", "campaigns.dispatch", "campaigns.cancel",
  "invitations.read_activity", "rsvps.read", "rsvps.override",
  "seating.read", "seating.configure", "seating.assign", "seating.approve",
  "checkin.scan", "checkin.manual_override",
  "reports.read", "reports.export", "documents.read", "documents.upload",
  "ai.use", "ai.execute_read_tools", "ai.execute_write_tools",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PLATFORM_ONLY: Permission[] = ["platform.manage", "integrations.manage"];
const pick = (prefixes: string[], extra: Permission[] = []): Permission[] => [
  ...PERMISSIONS.filter((p) => prefixes.some((pre) => p.startsWith(pre))),
  ...extra,
];

export const SYSTEM_ROLES: Record<string, { name: string; description: string; permissions: Permission[]; privileged: boolean }> = {
  super_admin: {
    name: "Super Admin",
    description: "Platform configuration, integrations, all events",
    permissions: [...PERMISSIONS],
    privileged: true,
  },
  admin: {
    name: "Event Owner",
    description: "Full administration of assigned events",
    permissions: PERMISSIONS.filter((p) => !PLATFORM_ONLY.includes(p)),
    privileged: true,
  },
  protocol_officer: {
    name: "Protocol Officer",
    description: "Guests, protocol ranks and categories",
    permissions: pick(["guests.", "protocol."], ["events.read", "rsvps.read", "seating.read", "reports.read", "ai.use", "ai.execute_read_tools"]),
    privileged: false,
  },
  campaign_approver: {
    name: "Campaign Approver",
    description: "Reviews and approves invitation campaigns",
    permissions: ["events.read", "guests.read", "campaigns.read", "campaigns.approve", "invitations.read_activity", "reports.read"],
    privileged: false,
  },
  seating_manager: {
    name: "Seating Manager",
    description: "Seating plans and assignments",
    permissions: pick(["seating."], ["events.read", "guests.read", "protocol.read", "reports.read"]),
    privileged: false,
  },
  checkin_supervisor: {
    name: "Check-in Supervisor",
    description: "Monitors gates, manages ushers, approves check-in exceptions",
    permissions: ["events.read", "guests.read", "checkin.scan", "checkin.manual_override", "reports.read"],
    privileged: false,
  },
  usher: {
    name: "Usher",
    description: "Validates and checks in guests at assigned gates",
    permissions: ["events.read", "checkin.scan"],
    privileged: false,
  },
};

export const PRIVILEGED_ROLES = Object.entries(SYSTEM_ROLES).filter(([, r]) => r.privileged).map(([k]) => k);

/** Creates/updates all permissions and system roles for an organization. */
export async function syncRoles(prisma: PrismaClient, organizationId: string): Promise<Record<string, string>> {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key, description: `Permission to ${key}` } });
  }
  const permRows = await prisma.permission.findMany({ where: { key: { in: [...PERMISSIONS] } } });
  const permId = new Map(permRows.map((p) => [p.key, p.id]));

  const roleIds: Record<string, string> = {};
  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId, key } },
      update: { name: def.name, description: def.description, isSystemRole: true },
      create: { organizationId, key, name: def.name, description: def.description, isSystemRole: true },
    });
    roleIds[key] = role.id;
    const wanted = def.permissions.map((p) => permId.get(p)!);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { notIn: wanted } } });
    await prisma.rolePermission.createMany({
      data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
  return roleIds;
}
