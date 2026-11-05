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
