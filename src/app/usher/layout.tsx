import { redirect } from "next/navigation";
import { getActor, canAny } from "@/lib/authz";
import { AccessDenied } from "@/components/auth/AccessDenied";

// The usher portal requires a signed-in user with check-in permission.
export default async function UsherLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/usher");
  if (!canAny(actor, "checkin.scan")) {
    return (
      <main className="min-h-screen p-4 bg-brand-canvas">
        <AccessDenied />
      </main>
    );
  }
  return <>{children}</>;
}
