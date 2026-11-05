import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { HttpError, readJson } from "@/lib/http";
import { gatesForActor } from "@/lib/checkin";
import { logAuditEvent } from "@/lib/audit";

// Ushers see the gates they are assigned to; supervisors and admins see all.
export const GET = withActor(async (request, { actor }) => {
  const event = await authorizeEvent(actor, "checkin.scan", new URL(request.url).searchParams.get("eventId"));
  const gates = await gatesForActor(actor, event.id);
  return NextResponse.json({ data: gates.map((g) => ({ id: g.id, code: g.code, name: g.name, fastTrackEnabled: g.fastTrackEnabled })) });
});

const Create = z.object({
  eventId: z.string().min(1),
  code: z.string().trim().regex(/^[A-Z0-9-]{1,20}$/, "Use capital letters, digits or dashes"),
  name: z.string().trim().min(2).max(100),
  fastTrackEnabled: z.boolean().default(false),
});

export const POST = withActor(async (request, { actor }) => {
  const body = Create.parse(await readJson(request));
  const event = await authorizeEvent(actor, "events.update", body.eventId);
  const exists = await prisma.gate.findUnique({ where: { eventId_code: { eventId: event.id, code: body.code } } });
  if (exists) throw new HttpError(409, "A gate with this code already exists.");
  const gate = await prisma.gate.create({ data: { ...body, eventId: event.id } });
  await logAuditEvent({
    organizationId: event.organizationId, eventId: event.id, actorUserId: actor.userId,
    action: "gate.created", entityType: "gate", entityId: gate.id, afterData: { code: gate.code, fastTrackEnabled: gate.fastTrackEnabled },
  });
  return NextResponse.json({ data: gate }, { status: 201 });
});
