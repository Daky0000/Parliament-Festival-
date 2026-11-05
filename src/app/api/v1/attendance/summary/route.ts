import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent, can } from "@/lib/authz";
import { forbidden } from "@/lib/http";

// Live operations view for supervisors and event staff (polled every few seconds).
export const GET = withActor(async (request, { actor }) => {
  const event = await authorizeEvent(actor, "checkin.scan", new URL(request.url).searchParams.get("eventId"));
  if (!can(actor, "reports.read", event.id) && !can(actor, "checkin.manual_override", event.id)) throw forbidden();
  const since = new Date(Date.now() - 12 * 3600 * 1000);

  const [invited, checkedIn, byGate, byCategory, attempts, recent, overrides, rsvp] = await Promise.all([
    prisma.eventGuest.count({ where: { eventId: event.id, guestStatus: "active" } }),
    prisma.attendanceRecord.count({ where: { eventId: event.id, checkinStatus: "checked_in" } }),
    prisma.attendanceRecord.groupBy({ by: ["gateId"], where: { eventId: event.id, checkinStatus: "checked_in" }, _count: { _all: true } }),
    prisma.$queryRaw<{ name: string | null; count: bigint }[]>`
      SELECT pc."name" AS name, COUNT(*)::bigint AS count
      FROM "attendance_records" a
      JOIN "event_guests" g ON g."id" = a."eventGuestId"
      LEFT JOIN "protocol_categories" pc ON pc."id" = g."protocolCategoryId"
      WHERE a."eventId" = ${event.id} AND a."checkinStatus" = 'checked_in'
      GROUP BY pc."name"`,
    prisma.checkinAttempt.groupBy({ by: ["result"], where: { eventId: event.id, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.attendanceRecord.findMany({
      where: { eventId: event.id },
      orderBy: { checkedInAt: "desc" },
      take: 15,
      include: { gate: true, recorder: { select: { fullName: true } }, eventGuest: { include: { person: true, protocolCategory: true } } },
    }),
    prisma.attendanceRecord.count({ where: { eventId: event.id, OR: [{ overrideBy: { not: null } }, { checkinStatus: "reversed" }] } }),
    prisma.$queryRaw<{ response: string; count: bigint }[]>`
      SELECT DISTINCT ON (i."eventGuestId") r."response" AS response, 1::bigint AS count
      FROM "rsvps" r JOIN "invitations" i ON i."id" = r."invitationId"
      WHERE i."eventId" = ${event.id}
      ORDER BY i."eventGuestId", r."submittedAt" DESC`,
  ]);
  const gates = await prisma.gate.findMany({ where: { eventId: event.id } });
  const gateName = new Map(gates.map((g) => [g.id, g.name]));
  const rsvpCounts = rsvp.reduce<Record<string, number>>((acc, r) => ((acc[r.response] = (acc[r.response] ?? 0) + 1), acc), {});

  return NextResponse.json({
    data: {
      invited,
      checkedIn,
      notYetArrived: Math.max(0, invited - checkedIn),
      rsvp: { accepted: rsvpCounts.accepted ?? 0, declined: rsvpCounts.declined ?? 0, pending: Math.max(0, invited - (rsvpCounts.accepted ?? 0) - (rsvpCounts.declined ?? 0)) },
      byGate: byGate.map((g) => ({ gate: g.gateId ? gateName.get(g.gateId) ?? "Unknown" : "No gate", count: g._count._all })),
      byCategory: byCategory.map((c) => ({ category: c.name ?? "Uncategorised", count: Number(c.count) })),
      attempts: Object.fromEntries(attempts.map((a) => [a.result, a._count._all])),
      overrides,
      recent: recent.map((r) => ({
        id: r.id,
        guest: r.eventGuest.person.fullName,
        category: r.eventGuest.protocolCategory?.name ?? null,
        gate: r.gate?.name ?? null,
        by: r.recorder?.fullName ?? null,
        at: r.checkedInAt,
        method: r.checkinMethod,
        status: r.checkinStatus,
      })),
    },
  });
});
