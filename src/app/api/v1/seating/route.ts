import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { HttpError, notFound, readJson } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";
import { runDeterministicSeatingEngine } from "@/lib/seating/engine";

export const GET = withActor(async (request, { actor }) => {
  const eventId = new URL(request.url).searchParams.get("eventId");
  await authorizeEvent(actor, "seating.read", eventId);

  const seatingPlans = await prisma.seatingPlan.findMany({
    where: { eventId: eventId! },
    include: {
      sections: {
        orderBy: { displayOrder: "asc" },
        include: {
          protocolCategory: true,
          seats: { orderBy: [{ rowLabel: "asc" }, { seatNumber: "asc" }] },
          seatAssignments: {
            where: { status: { in: ["proposed", "approved"] } },
            include: { eventGuest: { include: { person: true, protocolCategory: true } }, seat: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ data: seatingPlans });
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("auto_allocate"), seatingPlanId: z.string().min(1) }),
  z.object({
    action: z.literal("assign_seat"),
    seatingPlanId: z.string().min(1),
    eventGuestId: z.string().min(1),
    sectionId: z.string().min(1),
    seatId: z.string().min(1).nullish(),
    reason: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal("approve_plan"), seatingPlanId: z.string().min(1) }),
]);

const PERMISSION = { auto_allocate: "seating.assign", assign_seat: "seating.assign", approve_plan: "seating.approve" } as const;

export const POST = withActor(async (request, { actor }) => {
  const body = Body.parse(await readJson(request));

  // The event is taken from the plan record, never from the client.
  const plan = await prisma.seatingPlan.findUnique({ where: { id: body.seatingPlanId } });
  if (!plan) throw notFound();
  const event = await authorizeEvent(actor, PERMISSION[body.action], plan.eventId);
  const eventId = event.id;

  if (body.action === "auto_allocate") {
    const result = await runDeterministicSeatingEngine(eventId, plan.id, actor.userId);
    await logAuditEvent({
      organizationId: event.organizationId,
      eventId,
      actorUserId: actor.userId,
      action: "SEATING_AUTO_ALLOCATED",
      entityType: "seating_plan",
      entityId: plan.id,
      afterData: { assignedCount: result.assignedCount, conflicts: result.conflicts },
    });
    return NextResponse.json({ data: result });
  }

  if (body.action === "assign_seat") {
    const { eventGuestId, sectionId, seatId, reason } = body;
    const [guest, section, seat] = await Promise.all([
      prisma.eventGuest.findUnique({ where: { id: eventGuestId } }),
      prisma.seatingSection.findUnique({ where: { id: sectionId } }),
      seatId ? prisma.seat.findUnique({ where: { id: seatId } }) : Promise.resolve(null),
    ]);
    if (!guest || guest.eventId !== eventId) throw notFound();
    if (!section || section.seatingPlanId !== plan.id) throw notFound();
    if (seatId && (!seat || seat.sectionId !== section.id)) throw notFound();

    try {
      const assignment = await prisma.$transaction(async (tx) => {
        // Serialize assignments into this section so the capacity check holds.
        await tx.$queryRaw`SELECT id FROM "seating_sections" WHERE id = ${section.id} FOR UPDATE`;

        const previous = await tx.seatAssignment.findFirst({
          where: { seatingPlanId: plan.id, eventGuestId, status: { in: ["proposed", "approved"] } },
        });
        const active = await tx.seatAssignment.count({
          where: {
            sectionId: section.id,
            status: { in: ["proposed", "approved"] },
            ...(previous?.sectionId === section.id ? { NOT: { id: previous.id } } : {}),
          },
        });
        if (active >= section.capacity) {
          throw new HttpError(409, `Section ${section.name} is full (capacity ${section.capacity}).`);
        }

        if (previous) {
          await tx.seatAssignment.update({ where: { id: previous.id }, data: { status: "released" } });
        }
        const created = await tx.seatAssignment.create({
          data: {
            seatingPlanId: plan.id,
            eventGuestId,
            sectionId: section.id,
            seatId: seatId || null,
            assignmentType: "principal",
            status: "proposed",
            assignedBy: actor.userId,
            reason: reason || "Manual protocol officer allocation",
          },
          include: { section: true, seat: true, eventGuest: { include: { person: true, protocolCategory: true } } },
        });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId,
            actorUserId: actor.userId,
            action: previous ? "SEAT_REASSIGNED" : "SEAT_ASSIGNED",
            entityType: "seat_assignment",
            entityId: created.id,
            beforeData: previous ? JSON.stringify({ sectionId: previous.sectionId, seatId: previous.seatId }) : null,
            afterData: JSON.stringify({ sectionId: section.id, seatId: seatId || null, guestId: eventGuestId }),
          },
        });
        return created;
      });
      return NextResponse.json({ data: assignment });
    } catch (err) {
      // The partial unique index rejects a seat that is already taken.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError(409, "That seat is already assigned.");
      }
      throw err;
    }
  }

  // approve_plan
  const updatedPlan = await prisma.$transaction(async (tx) => {
    const p = await tx.seatingPlan.update({
      where: { id: plan.id },
      data: { status: "approved", approvedBy: actor.userId, approvedAt: new Date() },
    });
    await tx.seatAssignment.updateMany({
      where: { seatingPlanId: plan.id, status: "proposed" },
      data: { status: "approved", approvedBy: actor.userId },
    });
    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId,
        actorUserId: actor.userId,
        action: "SEATING_PLAN_APPROVED",
        entityType: "seating_plan",
        entityId: plan.id,
      },
    });
    return p;
  });
  return NextResponse.json({ data: updatedPlan });
});
