import { redirect } from "next/navigation";
import { getActor, can, accessibleEvents } from "@/lib/authz";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { NewEventForm } from "./NewEventForm";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/events/new");
  if (!can(actor, "events.create")) return <AccessDenied />;
  const hasEvents = (await accessibleEvents(actor)).length > 0;

  return (
    <section className="panel p-6 sm:p-8 space-y-6 max-w-[720px]">
      <header className="space-y-1">
        <h1 className="text-[22px] font-medium tracking-[-0.02em] text-brand-ink">
          {hasEvents ? "Create an event" : "Create your first event"}
        </h1>
        <p className="text-[14px] text-brand-muted">
          The event starts as a draft with the five standard protocol categories. You can change everything later.
        </p>
      </header>
      <NewEventForm />
    </section>
  );
}
