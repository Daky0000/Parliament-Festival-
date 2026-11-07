// Per-dignitary email status for the Guest Directory: was the invitation
// sent, delivered, opened (and when, how often), clicked, or did it fail.
// Pure function over rows already loaded, so it is used by the page, the
// polling endpoint and the single-send route alike.

export type EmailTrackingStatus = "not_sent" | "failed" | "bounced" | "sent" | "delivered" | "opened" | "clicked";

export type EmailTracking = {
  status: EmailTrackingStatus;
  lastSentAt: string | null;
  sendCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  clicked: boolean;
  visitedRsvpPage: boolean;
  lastError: string | null;
};

type AttemptRow = { status: string; submittedAt: Date | null; createdAt: Date; errorMessage?: string | null };
type EventRow = { eventType: string; occurredAt: Date; source?: string | null };
type InvitationRow = { emailAttempts?: AttemptRow[]; invitationEvents?: EventRow[] };

export const TRACKING_EVENT_TYPES = ["open_signal", "click", "link_access"];

export function emailTrackingFor(invitations: InvitationRow[] | undefined): EmailTracking {
  const attempts = (invitations ?? []).flatMap((i) => i.emailAttempts ?? []).sort((a, b) => +b.createdAt - +a.createdAt);
  const events = (invitations ?? []).flatMap((i) => i.invitationEvents ?? []);
  const sent = attempts.filter((a) => a.status !== "failed" && a.status !== "queued");
  const opens = events.filter((e) => e.eventType === "open_signal").sort((a, b) => +a.occurredAt - +b.occurredAt);
  const clicked = events.some((e) => e.eventType === "click");
  const visited = events.some((e) => e.eventType === "link_access");
  // A click or an RSVP page visit proves the email was opened even when images were blocked.
  const engagement = [...opens, ...events.filter((e) => e.eventType === "click" || e.eventType === "link_access")].sort(
    (a, b) => +a.occurredAt - +b.occurredAt
  );

  const latest = attempts[0];
  let status: EmailTrackingStatus = "not_sent";
  if (clicked || visited) status = "clicked";
  else if (opens.length) status = "opened";
  else if (sent.some((a) => a.status === "delivered")) status = "delivered";
  else if (latest && (latest.status === "bounced" || latest.status === "rejected")) status = "bounced";
  else if (sent.length) status = "sent";
  else if (latest?.status === "failed") status = "failed";

  const lastSent = sent[0]?.submittedAt ?? sent[0]?.createdAt ?? null;
  return {
    status,
    lastSentAt: lastSent ? lastSent.toISOString() : null,
    sendCount: sent.length,
    firstOpenedAt: engagement[0]?.occurredAt.toISOString() ?? null,
    lastOpenedAt: engagement.at(-1)?.occurredAt.toISOString() ?? null,
    openCount: opens.length,
    clicked: clicked || visited,
    visitedRsvpPage: visited,
    lastError: latest?.status === "failed" ? latest.errorMessage ?? "Send failed" : null,
  };
}

/** Prisma include for invitations that emailTrackingFor needs. */
export const trackingInvitationInclude = {
  emailAttempts: { orderBy: { attemptNumber: "desc" as const }, select: { status: true, submittedAt: true, createdAt: true, errorMessage: true } },
  invitationEvents: {
    where: { eventType: { in: TRACKING_EVENT_TYPES } },
    orderBy: { occurredAt: "desc" as const },
    select: { eventType: true, occurredAt: true, source: true },
  },
};

type AttemptAgg = { gid: string; sent: number; delivered: boolean; last_sent: Date | null; latest_status: string | null; latest_error: string | null };
type EventAgg = { gid: string; opens: number; clicked: boolean; visited: boolean; first_at: Date | null; last_at: Date | null };

/**
 * The same summary as emailTrackingFor, for every guest of an event, computed
 * by two grouped queries in the database instead of loading every row. Used
 * by the Guest Directory and its 30-second refresh, which must stay cheap.
 */
export async function emailTrackingForEvent(
  db: { $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T> },
  eventId: string
): Promise<Map<string, EmailTracking>> {
  const [attempts, events] = await Promise.all([
    db.$queryRaw<AttemptAgg[]>`
      SELECT i."eventGuestId" AS gid,
             (count(*) FILTER (WHERE ea."status" NOT IN ('failed','queued')))::int AS sent,
             bool_or(ea."status" = 'delivered') AS delivered,
             max(coalesce(ea."submittedAt", ea."createdAt")) FILTER (WHERE ea."status" NOT IN ('failed','queued')) AS last_sent,
             (array_agg(ea."status" ORDER BY ea."createdAt" DESC))[1] AS latest_status,
             (array_agg(ea."errorMessage" ORDER BY ea."createdAt" DESC))[1] AS latest_error
      FROM "email_attempts" ea JOIN "invitations" i ON i."id" = ea."invitationId"
      WHERE i."eventId" = ${eventId}
      GROUP BY i."eventGuestId"`,
    db.$queryRaw<EventAgg[]>`
      SELECT i."eventGuestId" AS gid,
             (count(*) FILTER (WHERE e."eventType" = 'open_signal'))::int AS opens,
             bool_or(e."eventType" = 'click') AS clicked,
             bool_or(e."eventType" = 'link_access') AS visited,
             min(e."occurredAt") AS first_at,
             max(e."occurredAt") AS last_at
      FROM "invitation_events" e JOIN "invitations" i ON i."id" = e."invitationId"
      WHERE i."eventId" = ${eventId} AND e."eventType" IN ('open_signal', 'click', 'link_access')
      GROUP BY i."eventGuestId"`,
  ]);
  const ev = new Map(events.map((e) => [e.gid, e]));
  const out = new Map<string, EmailTracking>();
  for (const id of new Set([...attempts.map((a) => a.gid), ...events.map((e) => e.gid)])) {
    const a = attempts.find((x) => x.gid === id);
    const e = ev.get(id);
    const sent = a?.sent ?? 0;
    const opens = e?.opens ?? 0;
    const engaged = !!(e?.clicked || e?.visited);
    let status: EmailTrackingStatus = "not_sent";
    if (engaged) status = "clicked";
    else if (opens) status = "opened";
    else if (a?.delivered) status = "delivered";
    else if (a && (a.latest_status === "bounced" || a.latest_status === "rejected")) status = "bounced";
    else if (sent) status = "sent";
    else if (a?.latest_status === "failed") status = "failed";
    out.set(id, {
      status,
      lastSentAt: a?.last_sent ? new Date(a.last_sent).toISOString() : null,
      sendCount: sent,
      firstOpenedAt: e?.first_at ? new Date(e.first_at).toISOString() : null,
      lastOpenedAt: e?.last_at ? new Date(e.last_at).toISOString() : null,
      openCount: opens,
      clicked: engaged,
      visitedRsvpPage: !!e?.visited,
      lastError: a?.latest_status === "failed" ? a.latest_error ?? "Send failed" : null,
    });
  }
  return out;
}
