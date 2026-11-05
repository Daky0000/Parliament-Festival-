import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, hasGlobalRole } from "@/lib/authz";

// Lists only the events the actor can reach, in the actor's organization.
export const GET = withActor(async (_req, { actor }) => {
  const events = await prisma.event.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(hasGlobalRole(actor) ? {} : { id: { in: [...actor.scopedEventIds] } }),
    },
    include: {
      categories: { orderBy: { rankOrder: "asc" } },
      _count: {
        select: {
          guests: true,
          invitations: true,
          seatingPlans: true,
          attendanceRecords: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: events });
});

