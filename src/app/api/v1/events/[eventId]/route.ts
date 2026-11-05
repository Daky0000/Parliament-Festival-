import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";

export const GET = withActor<{ eventId: string }>(async (_req, { actor, params }) => {
  const { eventId } = params;
  await authorizeEvent(actor, "events.read", eventId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      categories: { orderBy: { rankOrder: "asc" } },
      seatingPlans: {
        include: {
          sections: {
            include: {
              seats: true,
              _count: { select: { seatAssignments: true } },
            },
          },
        },
      },
      templates: {
        include: { versions: { orderBy: { versionNumber: "desc" } } },
      },
      campaigns: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { invitations: true, emailAttempts: true } },
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Calculate readiness metrics
  const totalGuests = await prisma.eventGuest.count({ where: { eventId } });
  const categoriesCount = event.categories.length;
  const templatesApproved = event.templates.some((t) =>
    t.versions.some((v) => v.status === "approved")
  );
  const seatingPlanApproved = event.seatingPlans.some(
    (p) => p.status === "approved"
  );
  const seatingCapacityTotal = event.seatingPlans[0]?.sections.reduce(
    (acc, s) => acc + s.capacity,
    0
  ) || 0;

  const readinessChecklist = [
    { key: "venue_date", title: "Venue & Schedule Configured", ready: !!event.venueName && !!event.startsAt },
    { key: "protocol_categories", title: "Protocol Categories Configured", ready: categoriesCount >= 5 },
    { key: "guest_list", title: "Guest Register Seeded", ready: totalGuests > 0 },
    { key: "invitation_template", title: "Luxury Template Approved", ready: templatesApproved },
    { key: "seating_plan", title: "Seating Capacity Configured", ready: seatingCapacityTotal >= totalGuests },
  ];

  return NextResponse.json({
    data: {
      event,
      readinessChecklist,
      metrics: {
        totalGuests,
        categoriesCount,
        seatingCapacityTotal,
      },
    },
  });
});
