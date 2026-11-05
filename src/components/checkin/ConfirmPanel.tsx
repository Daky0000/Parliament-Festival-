"use client";

import { useEffect, useRef, useState } from "react";
import { ResultCard } from "./ResultCard";
import type { GuestCard, ScanState } from "@/lib/checkin";

type Props = {
  eventId: string;
  gateId: string | null;
  token?: string;
  eventGuestId?: string;
  method: "qr" | "manual";
  initial: { state: ScanState; message: string; guest?: GuestCard; existing?: { checkedInAt: string; gateName: string | null; byName: string | null } | null };
  fastTrack: boolean;
  canOverride: boolean;
};

/**
 * Explicit confirmation. Nothing is recorded until the usher taps Confirm
 * (or, on a fast-track gate, this authenticated page sends the confirm
 * request itself; a link preview or scanner never runs this code).
 */
export function ConfirmPanel({ eventId, gateId, token, eventGuestId, method, initial, fastTrack, canOverride }: Props) {
  const [view, setView] = useState<Omit<Props["initial"], "state"> & { state: ScanState | "CHECKED_IN" }>(initial);
  const [busy, setBusy] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const fired = useRef(false);

  async function confirm(reason?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/check-in/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          gateId,
          ...(token ? { token } : { eventGuestId }),
          method: fastTrack && !reason ? "fast_track" : method,
          ...(reason ? { overrideReason: reason } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      const d = json?.data;
      if (d?.ok) setView({ state: "CHECKED_IN", message: "Attendance recorded.", guest: d.guest });
      else if (d) setView({ state: d.state, message: d.message, guest: d.guest ?? view.guest, existing: d.existing ?? null });
      else setView({ ...view, message: json?.error || "Could not reach the server. Do not admit; try again or use the contingency procedure." });
    } catch {
      setView({ ...view, message: "Network problem. Do not admit on an unverified result; try again." });
    } finally {
      setBusy(false);
      setShowOverride(false);
    }
  }

  useEffect(() => {
    if (fastTrack && initial.state === "VALID" && !fired.current) {
      fired.current = true;
      void confirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overridable = ["RSVP_DECLINED", "EVENT_NOT_ACTIVE", "EXPIRED", "REVOKED"].includes(view.state);

  return (
    <div className="space-y-4">
      <ResultCard state={view.state} message={view.message} guest={view.guest} existing={view.existing} />
      {view.state === "VALID" && !fastTrack && (
        <button
          type="button"
          onClick={() => confirm()}
          disabled={busy}
          className="w-full min-h-[64px] rounded-[14px] bg-[#067647] hover:bg-[#05603A] text-white text-[20px] font-semibold disabled:opacity-60"
        >
          {busy ? "Recording…" : "Confirm attendance"}
        </button>
      )}
      {canOverride && overridable && !showOverride && (
        <button type="button" onClick={() => setShowOverride(true)} className="w-full min-h-[52px] rounded-[14px] border-2 border-[#B54708] text-[#B54708] text-[16px] font-semibold">
          Supervisor override…
        </button>
      )}
      {showOverride && (
        <div className="panel p-4 space-y-3">
          <label htmlFor="reason" className="block text-[14px] font-medium text-brand-ink">Reason for admitting (recorded and audited)</label>
          <textarea id="reason" rows={3} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
            className="w-full border border-brand-line2 rounded-[10px] p-2 text-[15px]" />
          <button type="button" disabled={busy || overrideReason.trim().length < 5} onClick={() => confirm(overrideReason.trim())}
            className="w-full min-h-[52px] rounded-[14px] bg-[#B54708] text-white text-[16px] font-semibold disabled:opacity-50">
            Admit with override
          </button>
        </div>
      )}
    </div>
  );
}
