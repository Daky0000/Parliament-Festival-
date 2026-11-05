import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent, can } from "@/lib/authz";
import { HttpError, forbidden, notFound, readJson } from "@/lib/http";
import { revokeUserSessions } from "@/lib/session";
import { logAuditEvent } from "@/lib/audit";

// Check-in supervisors (and event owners) assign ushers to gates.
async function loadGate(actor: Parameters<typeof can>[0], gateId: string) {
  const gate = await prisma.gate.findUnique({ where: { id: gateId } });
  if (!gate) throw notFound();
  const event = await authorizeEvent(actor, "checkin.scan", gate.eventId);
  if (!can(actor, "checkin.manual_override", event.id) && !can(actor, "users.update", event.id)) throw forbidden();
  return { gate, event };
}

export const GET = withActor<{ gateId: string }>(async (_request, { actor, params }) => {
  const { gate } = await loadGate(actor, params.gateId);
  const rows = await prisma.userGateAssignment.findMany({
    where: { gateId: gate.id, revokedAt: null },
    include: { user: { select: { id: true, fullName: true, email: true, status: true } } },
  });
  return NextResponse.json({ data: rows.map((r) => ({ assignmentId: r.id, user: r.user, assignedAt: r.assignedAt })) });
});

const Body = z.object({ userId: z.string().min(1) });

export const POST = withActor<{ gateId: string }>(async (request, { actor, params }) => {
  const { gate, event } = await loadGate(actor, params.gateId);
  const { userId } = Body.parse(await readJson(request));
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roleAssignments: { where: { revokedAt: null }, include: { role: true } } },
  });
  if (!user || user.organizationId !== actor.organizationId) throw notFound();
  const isCheckinStaff = user.roleAssignments.some(
    (a) => ["usher", "checkin_supervisor"].includes(a.role.key) && (!a.eventId || a.eventId === event.id)
  );
  if (!isCheckinStaff) throw new HttpError(409, "Give this person the Usher role for this event first.");
  const exists = await prisma.userGateAssignment.findFirst({ where: { userId, gateId: gate.id, revokedAt: null } });
  if (!exists) await prisma.userGateAssignment.create({ data: { userId, gateId: gate.id, assignedBy: actor.userId } });
  await logAuditEvent({
    organizationId: event.organizationId, eventId: event.id, actorUserId: actor.userId,
    action: "gate.usher_assigned", entityType: "gate", entityId: gate.id, afterData: { userId },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});

export const DELETE = withActor<{ gateId: string }>(async (request, { actor, params }) => {
  const { gate, event } = await loadGate(actor, params.gateId);
  const userId = new URL(request.url).searchParams.get("userId") ?? "";
  const res = await prisma.userGateAssignment.updateMany({ where: { userId, gateId: gate.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) throw notFound();
  await revokeUserSessions(userId);
  await logAuditEvent({
    organizationId: event.organizationId, eventId: event.id, actorUserId: actor.userId,
    action: "gate.usher_removed", entityType: "gate", entityId: gate.id, afterData: { userId },
  });
  return NextResponse.json({ ok: true });
});
