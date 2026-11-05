import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { prisma } from "@/lib/db";
import { SeatingPlannerClientView } from "./SeatingPlannerClientView";

export const dynamic = "force-dynamic";

export default async function SeatingPage() {
  const guard = await guardPage("seating.read", "/seating");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;

  const event = await prisma.event.findFirst({
    where: { id: guard.event.id },
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
    <div className="space-y-[var(--frame)]">
      <div className="panel px-6 py-6 sm:px-8 sm:py-7">
        <h2 className="font-editorial text-[28px] sm:text-[34px] leading-[1.1] font-normal tracking-[-0.035em] text-[#0D1526]">
          Protocol Seating Planner & Capacity Engine
        </h2>
        <p className="text-[15px] leading-relaxed text-[#5B6374] mt-2 max-w-[70ch]">
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

