import { redirect } from "next/navigation";
import { getActor, can, type Actor } from "./authz";
import { getCurrentEvent } from "./current-event";
import type { Permission } from "./roles";

type Guard =
  | { ok: true; actor: Actor; event: NonNullable<Awaited<ReturnType<typeof getCurrentEvent>>["event"]> }
  | { ok: false; actor: Actor; reason: "forbidden" | "no_event" };

/**
 * Server-side page guard. Redirects anonymous users to /login; returns the
 * current event only if the actor holds `perm` on it. Pages render
 * <AccessDenied /> when ok is false. This, not the navigation, is the boundary.
 */
export async function guardPage(perm: Permission, nextPath = "/"): Promise<Guard> {
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const { event } = await getCurrentEvent(actor);
  if (!event) return { ok: false, actor, reason: "no_event" };
  if (!can(actor, perm, event.id)) return { ok: false, actor, reason: "forbidden" };
  return { ok: true, actor, event };
}
