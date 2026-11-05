"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, QrCode } from "lucide-react";

export function PassesToolbar({ eventId, canGenerate, missing }: { eventId: string; canGenerate: boolean; missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not generate passes");
      const d = json.data;
      setMessage(
        `${d.created} new pass(es) created, ${d.existing} already had one` +
          (d.declined ? `, ${d.declined} declined (no pass)` : "") +
          (d.noTemplate ? `, ${d.noTemplate} need an approved invitation template first` : "") +
          "."
      );
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {canGenerate && (
        <button type="button" onClick={generate} disabled={busy}
          className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-4 py-2.5 rounded-[10px] text-[14px] font-medium disabled:opacity-50">
          <QrCode className="w-4 h-4" aria-hidden="true" />
          {busy ? "Generating…" : missing > 0 ? `Generate missing passes (${missing})` : "Check all passes"}
        </button>
      )}
      <button type="button" onClick={() => window.print()}
        className="inline-flex items-center gap-2 border border-brand-line2 text-brand-ink px-4 py-2.5 rounded-[10px] text-[14px] font-medium">
        <Printer className="w-4 h-4" aria-hidden="true" /> Print passes
      </button>
      {message && <p role="status" className="text-[14px] text-brand-ink">{message}</p>}
    </div>
  );
}
