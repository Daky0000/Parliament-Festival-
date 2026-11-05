import { withActor, authorizeEvent, can } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { forbidden, notFound } from "@/lib/http";
import { toCsv } from "@/lib/csv";
import { logAuditEvent } from "@/lib/audit";
import type { Permission } from "@/lib/roles";

// Authenticated CSV exports, streamed directly (no stored files or public
// URLs). Contact details are excluded unless ?include=contact and the actor
// holds guests.export. Every export is audited with its filters.

type Ctx = { eventId: string; includeContact: boolean };
type Report = { permission: Permission; title: string; build: (c: Ctx) => Promise<{ header: string[]; rows: unknown[][] }> };

async function latestRsvps(eventId: string) {
  const rows = await prisma.$queryRaw<{ eventGuestId: string; response: string; companionCount: number; submittedAt: Date }[]>`
    SELECT DISTINCT ON (i."eventGuestId") i."eventGuestId", r."response", r."companionCount", r."submittedAt"
    FROM "rsvps" r JOIN "invitations" i ON i."id" = r."invitationId"
    WHERE i."eventId" = ${eventId}
    ORDER BY i."eventGuestId", r."submittedAt" DESC`;
  return new Map(rows.map((r) => [r.eventGuestId, r]));
}

const REPORTS: Record<string, Report> = {
  guests: {
    permission: "guests.export",
    title: "Guest master list",
    async build({ eventId, includeContact }) {
      const guests = await prisma.eventGuest.findMany({
        where: { eventId },
        include: { person: true, institution: true, protocolCategory: true },
        orderBy: [{ protocolCategory: { rankOrder: "asc" } }, { person: { fullName: "asc" } }],
      });
      const rsvp = await latestRsvps(eventId);
      return {
        header: ["Reference", "Title", "Name", "Designation", "Institution", "Category", "Rank", "Status", "RSVP", "Companions", ...(includeContact ? ["Email", "Phone"] : [])],
        rows: guests.map((g) => [
          g.guestReference, g.person.title, g.person.fullName, g.person.designation, g.institution?.name,
          g.protocolCategory?.name, g.protocolCategory?.rankOrder, g.guestStatus,
          rsvp.get(g.id)?.response ?? "pending", rsvp.get(g.id)?.companionCount ?? 0,
          ...(includeContact ? [g.person.email, g.person.phone] : []),
        ]),
      };
    },
  },
  rsvps: {
    permission: "rsvps.read",
    title: "RSVP report",
    async build({ eventId }) {
      const rows = await prisma.rsvp.findMany({
        where: { invitation: { eventId } },
        include: { invitation: { include: { eventGuest: { include: { person: true, protocolCategory: true } } } } },
        orderBy: { submittedAt: "desc" },
      });
      return {
        header: ["Submitted at", "Reference", "Guest", "Category", "Response", "Companions", "Confirmation", "Replaces earlier response"],
        rows: rows.map((r) => [
          r.submittedAt, r.invitation.eventGuest.guestReference, r.invitation.eventGuest.person.fullName,
          r.invitation.eventGuest.protocolCategory?.name, r.response, r.companionCount, r.confirmationReference, r.supersedesRsvpId ? "yes" : "no",
        ]),
      };
    },
  },
  attendance: {
    permission: "reports.export",
    title: "Attendance report",
    async build({ eventId }) {
      const rows = await prisma.attendanceRecord.findMany({
        where: { eventId },
        include: { gate: true, recorder: { select: { fullName: true } }, eventGuest: { include: { person: true, protocolCategory: true } } },
        orderBy: { checkedInAt: "asc" },
      });
      return {
        header: ["Checked in at (UTC)", "Reference", "Guest", "Category", "Gate", "Usher", "Method", "Status", "Override reason", "Reversed at", "Reversal reason"],
        rows: rows.map((r) => [
          r.checkedInAt, r.eventGuest.guestReference, r.eventGuest.person.fullName, r.eventGuest.protocolCategory?.name,
          r.gate?.name, r.recorder?.fullName, r.checkinMethod, r.checkinStatus, r.overrideReason, r.reversedAt, r.reversalReason,
        ]),
      };
    },
  },
  seating: {
    permission: "seating.read",
    title: "Seating plan and table list",
    async build({ eventId }) {
      const rows = await prisma.seatAssignment.findMany({
        where: { seatingPlan: { eventId }, status: { in: ["proposed", "approved"] } },
        include: { section: true, seat: true, eventGuest: { include: { person: true, protocolCategory: true } } },
        orderBy: [{ section: { displayOrder: "asc" } }, { seat: { seatCode: "asc" } }],
      });
      return {
        header: ["Section", "Seat", "Guest", "Reference", "Category", "Assignment status"],
        rows: rows.map((r) => [r.section.name, r.seat?.seatCode ?? "Open", r.eventGuest.person.fullName, r.eventGuest.guestReference, r.eventGuest.protocolCategory?.name, r.status]),
      };
    },
  },
  communications: {
    permission: "invitations.read_activity",
    title: "Email delivery report",
    async build({ eventId }) {
      const rows = await prisma.emailAttempt.findMany({
        where: { invitation: { eventId } },
        include: { invitation: { include: { eventGuest: { include: { person: true } } } } },
        orderBy: { createdAt: "desc" },
      });
      return {
        header: ["Created at", "Guest", "Reference", "Provider", "Status", "Provider message id", "Error code", "Delivered at"],
        rows: rows.map((r) => [
          r.createdAt, r.invitation.eventGuest.person.fullName, r.invitation.eventGuest.guestReference, r.provider,
          r.status === "submitted" ? "accepted by provider" : r.status, r.providerMessageId, r.errorCode, r.deliveredAt,
        ]),
      };
    },
  },
  exceptions: {
    permission: "reports.export",
    title: "Check-in exceptions and overrides",
    async build({ eventId }) {
      const rows = await prisma.auditLog.findMany({
        where: { eventId, action: { in: ["checkin.override", "checkin.reversed", "SEAT_REASSIGNED"] } },
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: "desc" },
      });
      return {
        header: ["At", "Action", "By", "Entity", "Reason"],
        rows: rows.map((r) => [r.createdAt, r.action, r.user?.fullName, r.entityId, r.reason]),
      };
    },
  },
  audit: {
    permission: "audit.read",
    title: "Audit report",
    async build({ eventId }) {
      const rows = await prisma.auditLog.findMany({
        where: { eventId },
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: "desc" },
        take: 20_000,
      });
      return {
        header: ["At", "Action", "Outcome", "By", "Actor type", "Entity type", "Entity", "Reason"],
        rows: rows.map((r) => [r.createdAt, r.action, r.outcome, r.user?.fullName, r.actorType, r.entityType, r.entityId, r.reason]),
      };
    },
  },
};

export const GET = withActor<{ report: string }>(async (request, { actor, params }) => {
  const report = REPORTS[params.report];
  if (!report) throw notFound();
  const url = new URL(request.url);
  const event = await authorizeEvent(actor, report.permission, url.searchParams.get("eventId"));
  const includeContact = url.searchParams.get("include") === "contact";
  if (includeContact && !can(actor, "guests.export", event.id)) throw forbidden();

  const { header, rows } = await report.build({ eventId: event.id, includeContact });
  await logAuditEvent({
    organizationId: event.organizationId,
    eventId: event.id,
    actorUserId: actor.userId,
    action: "report.exported",
    entityType: "report",
    entityId: params.report,
    afterData: { rows: rows.length, includeContact },
  });

  const filename = `${event.eventCode}-${params.report}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

