import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { withActor, authorizeEvent } from "@/lib/authz";
import { HttpError, readJson } from "@/lib/http";
import { canTransition } from "@/lib/event-lifecycle";
import { eventReadiness } from "@/lib/readiness";

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

  const totalGuests = await prisma.eventGuest.count({ where: { eventId } });
  const categoriesCount = event.categories.length;
  const seatingCapacityTotal = event.seatingPlans[0]?.sections.reduce((acc, s) => acc + s.capacity, 0) || 0;
  const readinessChecklist = await eventReadiness(eventId);

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

const Patch = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    name: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(2000).nullish(),
    venueName: z.string().trim().max(200).nullish(),
    venueAddress: z.string().trim().max(500).nullish(),
    timezone: z.string().trim().max(64).optional(),
    startsAt: z.coerce.date().nullish(),
    endsAt: z.coerce.date().nullish(),
    rsvpDeadline: z.coerce.date().nullish(),
  }),
  z.object({
    action: z.literal("transition"),
    to: z.enum(["draft", "scheduled", "active", "completed", "archived", "cancelled"]),
    reason: z.string().trim().max(500).optional(),
  }),
]);

export const PATCH = withActor<{ eventId: string }>(async (request, { actor, params }) => {
  const body = Patch.parse(await readJson(request));
  const perm = body.action === "transition" && body.to === "archived" ? "events.archive" : "events.update";
  const event = await authorizeEvent(actor, perm, params.eventId);

  if (body.action === "update") {
    const { action: _action, ...fields } = body;
    void _action;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.event.update({ where: { id: event.id }, data: fields });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          eventId: event.id,
          actorUserId: actor.userId,
          action: "event.updated",
          entityType: "event",
          entityId: event.id,
          afterData: JSON.stringify({ fields: Object.keys(fields) }),
        },
      });
      return u;
    });
    return NextResponse.json({ data: updated });
  }

  if (!canTransition(event.status, body.to)) {
    throw new HttpError(409, `An event cannot move from ${event.status} to ${body.to}.`);
  }
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.event.update({
      where: { id: event.id },
      data: {
        status: body.to,
        ...(body.to === "active" ? { activatedAt: now } : {}),
        ...(body.to === "completed" ? { completedAt: now } : {}),
        ...(body.to === "archived" ? { archivedAt: now } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        actorUserId: actor.userId,
        action: "event.status_changed",
        entityType: "event",
        entityId: event.id,
        reason: body.reason ?? null,
        beforeData: JSON.stringify({ status: event.status }),
        afterData: JSON.stringify({ status: body.to }),
      },
    });
    return u;
  });
  return NextResponse.json({ data: updated });
});
