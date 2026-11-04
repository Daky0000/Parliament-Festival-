import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { runDeterministicSeatingEngine } from "@/lib/seating/engine";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const seatingPlans = await prisma.seatingPlan.findMany({
    where: { eventId },
    include: {
      sections: {
        orderBy: { displayOrder: "asc" },
        include: {
          protocolCategory: true,
          seats: {
            orderBy: [{ rowLabel: "asc" }, { seatNumber: "asc" }],
          },
          seatAssignments: {
            where: { status: { in: ["proposed", "approved"] } },
            include: {
              eventGuest: {
                include: { person: true, protocolCategory: true },
              },
              seat: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ data: seatingPlans });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const body = await request.json();
  const { action, eventId, seatingPlanId, eventGuestId, sectionId, seatId, reason } = body;

  if (!eventId || !seatingPlanId) {
    return NextResponse.json(
      { error: "eventId and seatingPlanId are required" },
      { status: 400 }
    );
  }

  // 1. AUTO ALLOCATE USING PROTOCOL ENGINE
  if (action === "auto_allocate") {
    const result = await runDeterministicSeatingEngine(
      eventId,
      seatingPlanId,
      user?.userId
    );

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (event && user) {
      await logAuditEvent({
        organizationId: event.organizationId,
        eventId,
        actorUserId: user.userId,
        action: "SEATING_AUTO_ALLOCATED",
        entityType: "seating_plan",
        entityId: seatingPlanId,
        afterData: { assignedCount: result.assignedCount, conflicts: result.conflicts },
      });
    }

    return NextResponse.json({ data: result });
  }

  // 2. MANUAL ASSIGNMENT
  if (action === "assign_seat") {
    if (!eventGuestId || !sectionId) {
      return NextResponse.json(
        { error: "eventGuestId and sectionId are required" },
        { status: 400 }
      );
    }

    // Check section capacity
    const section = await prisma.seatingSection.findUnique({
      where: { id: sectionId },
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

    if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });

    if (section._count.seatAssignments >= section.capacity) {
      return NextResponse.json(
        { error: `Capacity reached for section ${section.name} (Max ${section.capacity})` },
        { status: 400 }
      );
    }

    // Cancel existing active assignment for this guest in this plan
    await prisma.seatAssignment.updateMany({
      where: {
        seatingPlanId,
        eventGuestId,
        status: { in: ["proposed", "approved"] },
      },
      data: { status: "released" },
    });

    // Create new assignment
    const assignment = await prisma.seatAssignment.create({
      data: {
        seatingPlanId,
        eventGuestId,
        sectionId,
        seatId: seatId || null,
        assignmentType: "principal",
        status: "proposed",
        assignedBy: user?.userId,
        reason: reason || "Manual protocol officer allocation",
      },
      include: {
        section: true,
        seat: true,
        eventGuest: { include: { person: true, protocolCategory: true } },
      },
    });

    return NextResponse.json({ data: assignment });
  }

  // 3. APPROVE SEATING PLAN
  if (action === "approve_plan") {
    const updatedPlan = await prisma.seatingPlan.update({
      where: { id: seatingPlanId },
      data: {
        status: "approved",
        approvedBy: user?.userId,
        approvedAt: new Date(),
      },
    });

    // Mark all assignments in this plan as approved
    await prisma.seatAssignment.updateMany({
      where: { seatingPlanId, status: "proposed" },
      data: { status: "approved", approvedBy: user?.userId },
    });

    return NextResponse.json({ data: updatedPlan });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
