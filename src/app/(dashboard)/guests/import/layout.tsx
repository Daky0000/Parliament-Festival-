import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";

export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  const guard = await guardPage("guests.import", "/guests/import");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;
  return <>{children}</>;
}
