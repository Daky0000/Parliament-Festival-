import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { getActor } from "@/lib/authz";
import { buildViewer } from "@/lib/viewer";

// Every dashboard page requires a signed-in user; each page also checks its
// own permission (see src/lib/page-guard.ts).
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const viewer = await buildViewer(actor);

  return (
    <div className="flex min-h-screen gap-[var(--frame)] p-[var(--frame)] bg-brand-canvas">
      <Sidebar viewer={viewer} />
      <div className="flex-1 flex flex-col min-w-0 gap-[var(--frame)]">
        <Topbar viewer={viewer} />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1280px] mx-auto space-y-[var(--frame)]">{children}</div>
        </main>
        <footer className="panel flex flex-wrap justify-between gap-3 px-6 py-5 text-[14px] text-brand-muted">
          <span>© 2026 Parliament of Ghana · Festival of Nine Lessons and Carols</span>
          <span>Event &amp; Protocol Platform · Version 3.0</span>
        </footer>
      </div>
    </div>
  );
}
