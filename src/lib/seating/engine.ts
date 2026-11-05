import { prisma } from "../db";

export interface SeatingAllocationResult {
  planId: string;
  totalEligibleGuests: number;
  assignedCount: number;
  unassignedCount: number;
  conflicts: Array<{
    type: "CAPACITY_EXCEEDED" | "CATEGORY_MISMATCH" | "NO_AVAILABLE_SEATS" | "GUEST_UNRANKED" | "OVERFLOW_ASSIGNED";
    severity: "warning" | "error";
    message: string;
    guestId?: string;
    sectionId?: string;
  }>;
  sectionUtilization: Array<{
    sectionId: string;
    sectionCode: string;
    name: string;
    capacity: number;
    allocated: number;
    percentage: number;
  }>;
}

/**
 * Deterministic protocol seating. Guests whose latest RSVP (across all their
 * invitations) is not "declined" are seated in rank order, grouped by
 * institution. Each guest goes to their category's section; if it is full,
 * to the next section (display order) of equal or lower precedence, never to
 * a section reserved for a higher rank. Runs in one transaction with every
 * section of the plan locked, so it cannot race manual assignments, and the
 * partial unique indexes back up the seat and guest rules.
 */
export async function runDeterministicSeatingEngine(
  eventId: string,
  seatingPlanId: string,
  assignedByUserId?: string
): Promise<SeatingAllocationResult> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "seating_sections" WHERE "seatingPlanId" = ${seatingPlanId} FOR UPDATE`;

      const plan = await tx.seatingPlan.findUnique({
        where: { id: seatingPlanId },
        include: {
          sections: {
            where: { isActive: true },
            orderBy: { displayOrder: "asc" },
            include: {
              seats: { where: { seatStatus: { in: ["available", "reserved"] } }, orderBy: [{ rowLabel: "asc" }, { seatNumber: "asc" }] },
              protocolCategory: true,
            },
          },
          seatAssignments: { where: { status: { in: ["proposed", "approved"] } } },
        },
      });
      if (!plan || plan.eventId !== eventId) throw new Error(`Seating plan ${seatingPlanId} not found for this event`);

      const guests = await tx.eventGuest.findMany({
        where: { eventId, guestStatus: "active" },
        include: {
          person: true,
          protocolCategory: true,
          institution: true,
          invitations: { include: { rsvps: { orderBy: { submittedAt: "desc" }, take: 1 } } },
        },
      });
      const latest = (g: (typeof guests)[number]) =>
        g.invitations.flatMap((i) => i.rsvps).sort((a, b) => +b.submittedAt - +a.submittedAt)[0];
      const confirmed = guests
        .filter((g) => latest(g)?.response !== "declined")
        .sort((a, b) => {
          const r = (a.protocolCategory?.rankOrder ?? 999) - (b.protocolCategory?.rankOrder ?? 999);
          if (r !== 0) return r;
          const inst = (a.institution?.name ?? "").localeCompare(b.institution?.name ?? "");
          // Deterministic tie-break so re-runs and audits are reproducible.
          return inst !== 0 ? inst : a.person.fullName.localeCompare(b.person.fullName) || a.id.localeCompare(b.id);
        });

      const conflicts: SeatingAllocationResult["conflicts"] = [];
      const assignedGuests = new Set(plan.seatAssignments.map((a) => a.eventGuestId));
      const takenSeats = new Set(plan.seatAssignments.filter((a) => a.seatId).map((a) => a.seatId!));
      const counts = new Map(plan.sections.map((s) => [s.id, plan.seatAssignments.filter((a) => a.sectionId === s.id).length]));
      const hasRoom = (id: string, capacity: number) => (counts.get(id) ?? 0) < capacity;

      for (const guest of confirmed) {
        if (assignedGuests.has(guest.id)) continue;
        if (!guest.protocolCategory) {
          conflicts.push({ type: "GUEST_UNRANKED", severity: "warning", message: `${guest.person.fullName} has no protocol category; not seated automatically.`, guestId: guest.id });
          continue;
        }
        const rank = guest.protocolCategory.rankOrder;
        const own = plan.sections.find((s) => s.protocolCategoryId === guest.protocolCategoryId);
        let target = own && hasRoom(own.id, own.capacity) ? own : undefined;
        if (!target) {
          // Overflow: untagged sections, or sections for an equal or lower precedence rank.
          target = plan.sections.find(
            (s) => s.id !== own?.id && hasRoom(s.id, s.capacity) && (!s.protocolCategory || s.protocolCategory.rankOrder >= rank)
          );
          if (target && own) {
            conflicts.push({
              type: "OVERFLOW_ASSIGNED",
              severity: "warning",
              message: `${own.name} is full; ${guest.person.fullName} was placed in ${target.name}.`,
              guestId: guest.id,
              sectionId: target.id,
            });
          }
        }
        if (!target) {
          conflicts.push({
            type: own ? "CAPACITY_EXCEEDED" : "NO_AVAILABLE_SEATS",
            severity: "error",
            message: own
              ? `${own.name} (capacity ${own.capacity}) and every eligible overflow section are full. ${guest.person.fullName} is unseated.`
              : `No eligible section with space for ${guest.person.fullName} (rank ${rank}).`,
            guestId: guest.id,
            sectionId: own?.id,
          });
          continue;
        }

        const seat = target.seats.find((s) => !takenSeats.has(s.id) && s.seatStatus === "available");
        await tx.seatAssignment.create({
          data: {
            seatingPlanId,
            eventGuestId: guest.id,
            sectionId: target.id,
            seatId: seat?.id ?? null,
            assignmentType: "principal",
            status: "proposed",
            assignedBy: assignedByUserId,
            reason: `Auto-allocated by rank ${rank} (${guest.protocolCategory.name})`,
          },
        });
        assignedGuests.add(guest.id);
        if (seat) takenSeats.add(seat.id);
        counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
      }

      return {
        planId: seatingPlanId,
        totalEligibleGuests: confirmed.length,
        assignedCount: confirmed.filter((g) => assignedGuests.has(g.id)).length,
        unassignedCount: confirmed.filter((g) => !assignedGuests.has(g.id)).length,
        conflicts,
        sectionUtilization: plan.sections.map((s) => {
          const allocated = counts.get(s.id) ?? 0;
          return {
            sectionId: s.id,
            sectionCode: s.sectionCode,
            name: s.name,
            capacity: s.capacity,
            allocated,
            percentage: s.capacity > 0 ? Math.round((allocated / s.capacity) * 100) : 0,
          };
        }),
      };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
}
