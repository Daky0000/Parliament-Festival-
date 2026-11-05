import { redirect } from "next/navigation";
import { getActor } from "@/lib/authz";
import { AuthShell } from "@/components/auth/AuthShell";
import { AccountForms } from "./AccountForms";

export default async function AccountPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/account");
  return (
    <AuthShell title="My account" subtitle={`${actor.fullName} · ${actor.email}`}>
      <AccountForms />
    </AuthShell>
  );
}
