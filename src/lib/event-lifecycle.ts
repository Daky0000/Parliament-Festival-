// Event lifecycle. "setup" is a legacy alias of "scheduled".
export const EVENT_TRANSITIONS: Record<string, string[]> = {
  draft: ["scheduled", "cancelled"],
  setup: ["scheduled", "active", "draft", "cancelled"],
  scheduled: ["active", "draft", "cancelled"],
  active: ["completed", "cancelled"],
  completed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};

export function canTransition(from: string, to: string): boolean {
  return EVENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Events that accept guest-facing activity (RSVP, check-in). */
export function isEventOpen(status: string): boolean {
  return status !== "cancelled" && status !== "archived";
}
