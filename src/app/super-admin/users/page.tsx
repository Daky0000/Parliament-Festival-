import { prisma } from "@/lib/db";
import { getActor } from "@/lib/authz";
import { SYSTEM_ROLES } from "@/lib/roles";
import { UsersClientView } from "./UsersClientView";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  // The layout already requires platform.manage.
  const actor = (await getActor())!;
  const events = await prisma.event.findMany({
    where: { organizationId: actor.organizationId },
    select: { id: true, name: true },
    orderBy: { startsAt: "asc" },
  });
  const roles = Object.entries(SYSTEM_ROLES).map(([key, r]) => ({ key, name: r.name, description: r.description }));
  return <UsersClientView events={events} roles={roles} selfId={actor.userId} />;
}
