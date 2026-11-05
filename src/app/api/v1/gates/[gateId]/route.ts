import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { notFound, readJson } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";

const Patch = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  fastTrackEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withActor<{ gateId: string }>(async (request, { actor, params }) => {
  const gate = await prisma.gate.findUnique({ where: { id: params.gateId } });
  if (!gate) throw notFound();
  const event = await authorizeEvent(actor, "events.update", gate.eventId);
  const body = Patch.parse(await readJson(request));
  const updated = await prisma.gate.update({ where: { id: gate.id }, data: body });
  await logAuditEvent({
    organizationId: event.organizationId, eventId: event.id, actorUserId: actor.userId,
    action: "gate.updated", entityType: "gate", entityId: gate.id,
    beforeData: { fastTrackEnabled: gate.fastTrackEnabled, isActive: gate.isActive }, afterData: body,
  });
  return NextResponse.json({ data: updated });
});
