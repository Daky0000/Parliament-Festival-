import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { withActor, hasGlobalRole, requireGlobal } from "@/lib/authz";
import { HttpError, readJson } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";
import { DEFAULT_PROTOCOL_CATEGORIES } from "@/lib/protocol-defaults";

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


const Create = z.object({
  eventCode: z.string().trim().regex(/^[A-Z0-9-]{3,32}$/, "Use 3-32 capital letters, digits or dashes"),
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  venueName: z.string().trim().max(200).optional(),
  venueAddress: z.string().trim().max(500).optional(),
  timezone: z.string().trim().max(64).default("Africa/Accra"),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  rsvpDeadline: z.coerce.date().optional(),
});

export const POST = withActor(async (request, { actor }) => {
  requireGlobal(actor, "events.create");
  const body = Create.parse(await readJson(request));
  if (body.startsAt && body.endsAt && body.endsAt <= body.startsAt) throw new HttpError(400, "The event must end after it starts.");
  const clash = await prisma.event.findUnique({
    where: { organizationId_eventCode: { organizationId: actor.organizationId, eventCode: body.eventCode } },
  });
  if (clash) throw new HttpError(409, "An event with this code already exists.");
  const event = await prisma.event.create({
    data: {
      ...body,
      organizationId: actor.organizationId,
      status: "draft",
      createdBy: actor.userId,
      categories: { create: DEFAULT_PROTOCOL_CATEGORIES.map((c) => ({ ...c })) },
    },
  });
  await logAuditEvent({
    organizationId: actor.organizationId,
    eventId: event.id,
    actorUserId: actor.userId,
    action: "event.created",
    entityType: "event",
    entityId: event.id,
    afterData: { eventCode: event.eventCode, name: event.name },
  });
  return NextResponse.json({ data: event }, { status: 201 });
});
