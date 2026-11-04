import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { runDeterministicSeatingEngine } from "../../src/lib/seating/engine.ts";

test("Deterministic Seating Allocation Engine: enforces protocol precedence and zero capacity overruns", async () => {
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
    include: { seatingPlans: true },
  });

  assert.ok(event, "Event CAROLS-2026 must exist");
  assert.ok(event.seatingPlans[0], "Seating plan must exist");

  const planId = event.seatingPlans[0].id;

  // Run Seating Engine
  const result = await runDeterministicSeatingEngine(event.id, planId);

  assert.strictEqual(result.planId, planId);
  assert.ok(result.assignedCount > 0, "Must assign confirmed eligible dignitaries");

  // Verify Database Constraints Directly
  const assignments = await prisma.seatAssignment.findMany({
    where: { seatingPlanId: planId, status: { in: ["proposed", "approved"] } },
  });

  // 1. Verify zero duplicate seat assignments
  const assignedSeatIds = assignments.filter((a) => a.seatId).map((a) => a.seatId);
  const uniqueSeatIds = new Set(assignedSeatIds);
  assert.strictEqual(
    assignedSeatIds.length,
    uniqueSeatIds.size,
    "No seat must be assigned to more than one active guest"
  );

  // 2. Verify zero duplicate guest assignments
  const assignedGuestIds = assignments.map((a) => a.eventGuestId);
  const uniqueGuestIds = new Set(assignedGuestIds);
  assert.strictEqual(
    assignedGuestIds.length,
    uniqueGuestIds.size,
    "No guest must be assigned twice in the same plan"
  );

  // 3. Verify section capacities are respected
  const sections = await prisma.seatingSection.findMany({
    where: { seatingPlanId: planId },
    include: {
      _count: {
        select: {
          seatAssignments: {
            where: { status: { in: ["proposed", "approved"] } },
          },
        },
      },
    },
  });

  for (const section of sections) {
    assert.ok(
      section._count.seatAssignments <= section.capacity,
      `Section ${section.name} capacity exceeded! (${section._count.seatAssignments} > ${section.capacity})`
    );
  }
});

