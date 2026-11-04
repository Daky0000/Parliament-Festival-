import { prisma } from "../db";

export interface SeatingAllocationResult {
  planId: string;
  totalEligibleGuests: number;
  assignedCount: number;
  unassignedCount: number;
  conflicts: Array<{
    type: "CAPACITY_EXCEEDED" | "CATEGORY_MISMATCH" | "NO_AVAILABLE_SEATS" | "GUEST_UNRANKED";
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
 * Runs the deterministic protocol-based seating allocation engine.
 * Ensures zero duplicate seat bookings and strictly prevents capacity overruns.
 */
export async function runDeterministicSeatingEngine(
  eventId: string,
  seatingPlanId: string,
  assignedByUserId?: string
): Promise<SeatingAllocationResult> {
  // 1. Fetch Seating Plan with sections and seats
  const seatingPlan = await prisma.seatingPlan.findUnique({
    where: { id: seatingPlanId },
    include: {
      sections: {
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        include: {
          seats: {
            where: { seatStatus: { in: ["available", "reserved"] } },
            orderBy: [{ rowLabel: "asc" }, { seatNumber: "asc" }],
          },
          protocolCategory: true,
        },
      },
      seatAssignments: {
        where: { status: { in: ["proposed", "approved"] } },
      },
    },
  });

  if (!seatingPlan) {
    throw new Error(`Seating plan ${seatingPlanId} not found`);
  }

  // 2. Fetch Confirmed Attendees (Guests with RSVPs accepted or active guests requiring seating)
  const eligibleGuests = await prisma.eventGuest.findMany({
    where: {
      eventId,
      guestStatus: "active",
      // Guests who either accepted their invitation or are marked as confirmed
    },
    include: {
      person: true,
      protocolCategory: true,
      institution: true,
      invitations: {
        include: {
          rsvps: {
            orderBy: { submittedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  // Filter to guests whose latest RSVP is accepted or have no decline
  const confirmedGuests = eligibleGuests.filter((g) => {
    const latestRsvp = g.invitations[0]?.rsvps[0];
    return !latestRsvp || latestRsvp.response === "accepted";
  });

  // Sort guests strictly by Protocol Rank Order (Rank 1 first: Parliamentary Leadership -> Diplomatic Corps -> State/Judiciary -> Clergy -> CSOs)
  confirmedGuests.sort((a, b) => {
    const rankA = a.protocolCategory?.rankOrder ?? 999;
    const rankB = b.protocolCategory?.rankOrder ?? 999;
    if (rankA !== rankB) return rankA - rankB;
    // Secondary sort: institution name (grouping delegation members)
    const instA = a.institution?.name ?? "";
    const instB = b.institution?.name ?? "";
    return instA.localeCompare(instB);
  });

  const conflicts: SeatingAllocationResult["conflicts"] = [];
  const existingAssignments = seatingPlan.seatAssignments;
  const assignedGuestIds = new Set(existingAssignments.map((a) => a.eventGuestId));
  const assignedSeatIds = new Set(existingAssignments.filter((a) => a.seatId).map((a) => a.seatId!));

  // Section occupancy tracker
  const sectionCounts = new Map<string, number>();
  for (const section of seatingPlan.sections) {
    const count = existingAssignments.filter((a) => a.sectionId === section.id).length;
    sectionCounts.set(section.id, count);
  }

  let newlyAssigned = 0;

  // 3. Deterministic Allocation Loop
  for (const guest of confirmedGuests) {
    // If guest is already assigned in this plan, preserve assignment
    if (assignedGuestIds.has(guest.id)) {
      continue;
    }

    if (!guest.protocolCategory) {
      conflicts.push({
        type: "GUEST_UNRANKED",
        severity: "warning",
        message: `Guest ${guest.person.fullName} has no protocol category assigned. Cannot allocate automatically.`,
        guestId: guest.id,
      });
      continue;
    }

    // Match candidate section by protocol category or lowest rank order
    let targetSection = seatingPlan.sections.find(
      (s) => s.protocolCategoryId === guest.protocolCategoryId
    );

    // Fallback: match by section with available capacity
    if (!targetSection) {
      targetSection = seatingPlan.sections.find((s) => {
        const cur = sectionCounts.get(s.id) || 0;
        return cur < s.capacity;
      });
    }

    if (!targetSection) {
      conflicts.push({
        type: "NO_AVAILABLE_SEATS",
        severity: "error",
        message: `No eligible section found for guest ${guest.person.fullName} (Rank ${guest.protocolCategory.rankOrder}).`,
        guestId: guest.id,
      });
      continue;
    }

    const currentOccupancy = sectionCounts.get(targetSection.id) || 0;
    if (currentOccupancy >= targetSection.capacity) {
      conflicts.push({
        type: "CAPACITY_EXCEEDED",
        severity: "error",
        message: `Section ${targetSection.name} capacity (${targetSection.capacity}) reached. Could not seat ${guest.person.fullName}.`,
        guestId: guest.id,
        sectionId: targetSection.id,
      });
      continue;
    }

    // Find first available seat in the section
    const availableSeat = targetSection.seats.find(
      (seat) => !assignedSeatIds.has(seat.id) && seat.seatStatus === "available"
    );

    // Create assignment transactionally
    await prisma.seatAssignment.create({
      data: {
        seatingPlanId,
        eventGuestId: guest.id,
        sectionId: targetSection.id,
        seatId: availableSeat?.id ?? null,
        assignmentType: "principal",
        status: "proposed",
        assignedBy: assignedByUserId,
        reason: `Auto-allocated by Protocol Engine based on Rank ${guest.protocolCategory.rankOrder} (${guest.protocolCategory.name})`,
      },
    });

    assignedGuestIds.add(guest.id);
    if (availableSeat) assignedSeatIds.add(availableSeat.id);
    sectionCounts.set(targetSection.id, currentOccupancy + 1);
    newlyAssigned++;
  }

  // Calculate final utilization
  const sectionUtilization = seatingPlan.sections.map((s) => {
    const allocated = sectionCounts.get(s.id) || 0;
    const percentage = s.capacity > 0 ? Math.round((allocated / s.capacity) * 100) : 0;
    return {
      sectionId: s.id,
      sectionCode: s.sectionCode,
      name: s.name,
      capacity: s.capacity,
      allocated,
      percentage,
    };
  });

  return {
    planId: seatingPlanId,
    totalEligibleGuests: confirmedGuests.length,
    assignedCount: assignedGuestIds.size,
    unassignedCount: confirmedGuests.length - assignedGuestIds.size,
    conflicts,
    sectionUtilization,
  };
}

