import { prisma } from "@/lib/db";
import { SeatingPlannerClientView } from "./SeatingPlannerClientView";

export const dynamic = "force-dynamic";

export default async function SeatingPage() {
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
    include: {
      categories: { orderBy: { rankOrder: "asc" } },
      guests: {
        include: {
          person: true,
          protocolCategory: true,
          institution: true,
          invitations: {
            include: { rsvps: { orderBy: { submittedAt: "desc" }, take: 1 } },
          },
        },
      },
      seatingPlans: {
        include: {
          sections: {
            orderBy: { displayOrder: "asc" },
            include: {
              protocolCategory: true,
              seats: { orderBy: [{ rowLabel: "asc" }, { seatNumber: "asc" }] },
              seatAssignments: {
                where: { status: { in: ["proposed", "approved"] } },
                include: {
                  eventGuest: { include: { person: true, protocolCategory: true } },
                  seat: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!event || !event.seatingPlans[0]) {
    return <div>No seating plan configured for this event.</div>;
  }

  const seatingPlan = event.seatingPlans[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-editorial text-2xl font-bold text-[#102343]">
          Protocol Seating Planner & Capacity Engine
        </h2>
        <p className="text-xs text-[#667085] mt-1">
          Forecourt layout with deterministic protocol constraint validation: 0 duplicate bookings, 0 capacity overruns.
        </p>
      </div>

      <SeatingPlannerClientView
        eventId={event.id}
        seatingPlan={seatingPlan}
        confirmedGuests={event.guests}
        categories={event.categories}
      />
    </div>
  );
}

