import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { can } from "@/lib/authz";
import { eventReadiness } from "@/lib/readiness";
import type { Permission } from "@/lib/roles";
import { CheckCircle2, XCircle, Download } from "lucide-react";

export const dynamic = "force-dynamic";

const REPORTS: { key: string; title: string; description: string; permission: Permission }[] = [
  { key: "guests", title: "Guest master list", description: "Names, institutions, categories and RSVP status. Contact details only on request.", permission: "guests.export" },
  { key: "rsvps", title: "RSVP report", description: "Every response, including changes, with confirmation references.", permission: "rsvps.read" },
  { key: "seating", title: "Seating plan", description: "Section and seat for every seated guest.", permission: "seating.read" },
  { key: "communications", title: "Email delivery report", description: "Provider-accepted, delivered, bounced and failed messages.", permission: "invitations.read_activity" },
  { key: "attendance", title: "Attendance report", description: "Check-ins with gate, usher, method, overrides and reversals.", permission: "reports.export" },
  { key: "exceptions", title: "Exceptions and overrides", description: "Supervisor overrides, reversals and seat reassignments.", permission: "reports.export" },
  { key: "audit", title: "Audit report", description: "All recorded actions for this event.", permission: "audit.read" },
];

export default async function ReportsPage() {
  const guard = await guardPage("reports.read", "/reports");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;
  const { actor, event } = guard;
  const readiness = await eventReadiness(event.id);
  const readyCount = readiness.filter((r) => r.ready).length;

  return (
    <div className="space-y-[var(--frame)]">
      <section className="panel p-6 sm:p-8 space-y-4" aria-labelledby="readiness">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="readiness" className="text-[22px] font-medium text-brand-ink">Event readiness</h2>
          <span className="chip">{readyCount} of {readiness.length} ready</span>
        </div>
        <ul className="grid sm:grid-cols-2 gap-3">
          {readiness.map((r) => (
            <li key={r.key} className="flex items-start gap-3 rounded-[12px] border border-brand-line p-3">
              {r.ready ? (
                <CheckCircle2 className="w-5 h-5 text-[#067647] flex-none" aria-label="Ready" />
              ) : (
                <XCircle className="w-5 h-5 text-[#B42318] flex-none" aria-label="Not ready" />
              )}
              <div>
                <p className="text-[15px] font-medium text-brand-ink">{r.title}</p>
                <p className="text-[13px] text-brand-muted">{r.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-6 sm:p-8 space-y-4" aria-labelledby="exports">
        <h2 id="exports" className="text-[22px] font-medium text-brand-ink">Reports</h2>
        <p className="text-[14px] text-brand-muted">Downloads are CSV, generated on request. Every export is recorded in the audit log.</p>
        <ul className="divide-y divide-brand-line">
          {REPORTS.filter((r) => can(actor, r.permission, event.id)).map((r) => (
            <li key={r.key} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[15px] font-medium text-brand-ink">{r.title}</p>
                <p className="text-[13px] text-brand-muted">{r.description}</p>
              </div>
              <div className="flex gap-2">
                <a href={`/api/v1/reports/${r.key}?eventId=${event.id}`} className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] border border-brand-line2 text-[14px] text-brand-ink">
                  <Download className="w-4 h-4" aria-hidden="true" /> CSV
                </a>
                {r.key === "guests" && (
                  <a href={`/api/v1/reports/guests?eventId=${event.id}&include=contact`} className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] border border-brand-line2 text-[14px] text-brand-ink">
                    <Download className="w-4 h-4" aria-hidden="true" /> With contact details
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
