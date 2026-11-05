import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getActor, can } from "@/lib/authz";
import { verifyScan } from "@/lib/checkin";
import { ConfirmPanel } from "@/components/checkin/ConfirmPanel";
import { ResultCard } from "@/components/checkin/ResultCard";

export const dynamic = "force-dynamic";

// Opened by the phone's built-in camera from a guest's QR pass. Strictly
// read-only: it verifies and shows the guest; attendance is recorded only by
// the explicit confirm request.
export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(`/check-in/scan/${token}`)}`);
  const gateId = (await cookies()).get("pf_gate")?.value ?? null;
  const scan = await verifyScan(actor, token, gateId);

  return (
    <main className="min-h-screen bg-brand-canvas p-4 max-w-[520px] mx-auto space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-[0.14em] text-brand-muted">{scan.event?.name ?? "Check-in"}</p>
          <p className="text-[15px] font-medium text-brand-ink">{scan.gate ? `Gate: ${scan.gate.name}` : "No gate selected"}</p>
        </div>
        <Link href="/usher" className="px-4 py-3 rounded-[12px] border border-brand-line2 text-[15px] text-brand-ink bg-white">
          Back to portal
        </Link>
      </header>

      {scan.event && (scan.state === "VALID" || scan.state === "RSVP_DECLINED" || scan.state === "EVENT_NOT_ACTIVE" || scan.state === "EXPIRED" || scan.state === "REVOKED") ? (
        <ConfirmPanel
          eventId={scan.event.id}
          gateId={scan.gate?.id ?? null}
          token={token}
          method="qr"
          fastTrack={!!scan.gate?.fastTrackEnabled}
          canOverride={can(actor, "checkin.manual_override", scan.event.id)}
          initial={{ state: scan.state, message: scan.message, guest: scan.guest }}
        />
      ) : (
        <ResultCard state={scan.state} message={scan.message} guest={scan.guest} existing={scan.existing} />
      )}
    </main>
  );
}
