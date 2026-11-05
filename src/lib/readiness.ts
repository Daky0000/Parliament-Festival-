import { prisma } from "./db";
import { getProviderSecret } from "./integrations";

// Event readiness checklist (spec §6.3), computed from real state only.

export type ReadinessItem = { key: string; title: string; ready: boolean; detail: string };

export async function eventReadiness(eventId: string): Promise<ReadinessItem[]> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const [guests, unranked, approvedTemplate, plan, gates, ushersOnGates, resendKey, vynfy] = await Promise.all([
    prisma.eventGuest.count({ where: { eventId, guestStatus: "active" } }),
    prisma.eventGuest.count({ where: { eventId, guestStatus: "active", protocolCategoryId: null } }),
    prisma.invitationTemplateVersion.count({ where: { template: { eventId }, status: "approved" } }),
    prisma.seatingPlan.findFirst({ where: { eventId }, orderBy: { versionNumber: "desc" }, include: { sections: { where: { isActive: true } } } }),
    prisma.gate.count({ where: { eventId, isActive: true } }),
    prisma.userGateAssignment.count({ where: { revokedAt: null, gate: { eventId, isActive: true } } }),
    getProviderSecret("resend"),
    prisma.platformIntegration.findUnique({ where: { providerKey: "vynfy" } }),
  ]);
  const capacity = plan?.sections.reduce((n, s) => n + s.capacity, 0) ?? 0;
  const accepted = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT DISTINCT ON (i."eventGuestId") r."response"
      FROM "rsvps" r JOIN "invitations" i ON i."id" = r."invitationId"
      WHERE i."eventId" = ${eventId}
      ORDER BY i."eventGuestId", r."submittedAt" DESC
    ) x WHERE x."response" = 'accepted'`;
  const acceptedCount = Number(accepted[0]?.n ?? 0);

  return [
    { key: "schedule", title: "Date, time zone and venue set", ready: !!event.startsAt && !!event.venueName && !!event.timezone, detail: event.venueName ?? "No venue" },
    { key: "guests", title: "Guest list loaded and ranked", ready: guests > 0 && unranked === 0, detail: `${guests} guests, ${unranked} without a category` },
    { key: "template", title: "Invitation template approved", ready: approvedTemplate > 0, detail: approvedTemplate ? "Approved version available" : "No approved version" },
    { key: "email", title: "Email provider configured", ready: !!resendKey && !!process.env.RESEND_FROM_EMAIL, detail: resendKey ? "Resend key present" : "No Resend key" },
    { key: "sms", title: "SMS provider enabled (optional)", ready: !!vynfy?.isEnabled, detail: vynfy ? (vynfy.isEnabled ? "Enabled" : "Disabled") : "Not configured" },
    { key: "rsvp_deadline", title: "RSVP deadline set", ready: !!event.rsvpDeadline, detail: event.rsvpDeadline ? event.rsvpDeadline.toISOString() : "Not set" },
    { key: "seating", title: "Seating capacity covers accepted guests", ready: !!plan && capacity >= acceptedCount, detail: `${capacity} seats for ${acceptedCount} accepted` },
    { key: "gates", title: "Gates configured with ushers assigned", ready: gates > 0 && ushersOnGates > 0, detail: `${gates} gates, ${ushersOnGates} usher assignments` },
    { key: "checkin_window", title: "Event active for check-in", ready: event.status === "active", detail: `Status: ${event.status}` },
  ];
}
