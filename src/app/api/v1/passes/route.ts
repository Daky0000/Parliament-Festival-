import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { readJson } from "@/lib/http";
import { ensureGuestPass } from "@/lib/guest-tokens";
import { logAuditEvent } from "@/lib/audit";

const Body = z.object({ eventId: z.string().min(1) });

// Generates a working QR pass for every guest who currently holds a seat
// (backfill for seats assigned before passes were automatic). Idempotent.
export const POST = withActor(async (request, { actor }) => {
  const { eventId } = Body.parse(await readJson(request));
  const event = await authorizeEvent(actor, "seating.assign", eventId);
  const seated = await prisma.seatAssignment.findMany({
    where: { seatingPlan: { eventId: event.id }, status: { in: ["proposed", "approved"] } },
    select: { eventGuestId: true },
    distinct: ["eventGuestId"],
  });
  const counts = { created: 0, existing: 0, declined: 0, noTemplate: 0, inactive: 0 };
  for (const s of seated) {
    const r = await prisma.$transaction((tx) => ensureGuestPass(tx, s.eventGuestId));
    if ("credentialId" in r) r.created ? counts.created++ : counts.existing++;
    else if (r.skipped === "declined") counts.declined++;
    else if (r.skipped === "no_template") counts.noTemplate++;
    else counts.inactive++;
  }
  await logAuditEvent({
    organizationId: event.organizationId, eventId: event.id, actorUserId: actor.userId,
    action: "passes.generated", entityType: "event", entityId: event.id, afterData: counts,
  });
  return NextResponse.json({ data: { seated: seated.length, ...counts } });
});
