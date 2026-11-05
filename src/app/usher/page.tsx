import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getActor, can } from "@/lib/authz";
import { getCurrentEvent } from "@/lib/current-event";
import { gatesForActor } from "@/lib/checkin";
import { UsherPortal } from "./UsherPortal";

export const dynamic = "force-dynamic";

// Mobile usher portal. The layout already requires check-in permission.
export default async function UsherPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/usher");
  const { event } = await getCurrentEvent(actor);
  if (!event || !can(actor, "checkin.scan", event.id)) {
    return (
      <main className="min-h-screen bg-brand-canvas p-4">
        <p className="panel p-6 text-brand-ink">You are not assigned to an event that is open for check-in.</p>
      </main>
    );
  }
  const gates = (await gatesForActor(actor, event.id)).map((g) => ({ id: g.id, name: g.name, fastTrackEnabled: g.fastTrackEnabled }));
  const savedGate = (await cookies()).get("pf_gate")?.value ?? null;
  return (
    <UsherPortal
      usherName={actor.fullName}
      event={{ id: event.id, name: event.name, status: event.status }}
      gates={gates}
      initialGateId={gates.some((g) => g.id === savedGate) ? savedGate : gates.length === 1 ? gates[0].id : null}
      canOverride={can(actor, "checkin.manual_override", event.id)}
    />
  );
}
