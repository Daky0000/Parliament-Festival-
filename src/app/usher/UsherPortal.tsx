"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Search, LogOut, RotateCcw } from "lucide-react";
import { ConfirmPanel } from "@/components/checkin/ConfirmPanel";
import { ResultCard } from "@/components/checkin/ResultCard";
import { QrScanner } from "@/components/checkin/QrScanner";
import type { GuestCard, ScanResult } from "@/lib/checkin";

type Gate = { id: string; name: string; fastTrackEnabled: boolean };

function setGateCookie(id: string) {
  // A preference only; the gate is recorded with each check-in for reports.
  document.cookie = `pf_gate=${encodeURIComponent(id)}; Path=/; SameSite=Lax; Max-Age=43200${location.protocol === "https:" ? "; Secure" : ""}`;
}

type Verified = { token: string; result: ScanResult };

/**
 * Usher dashboard (web, no app): "Scan QR code" opens the phone camera in the
 * page and verifies the pass automatically; "Enter reference" finds a guest
 * by guest reference, invitation reference, seat number or name.
 */
export function UsherPortal({
  usherName,
  event,
  gates,
  initialGateId,
  canOverride,
}: {
  usherName: string;
  event: { id: string; name: string; status: string };
  gates: Gate[];
  initialGateId: string | null;
  canOverride: boolean;
}) {
  const router = useRouter();
  const [gateId, setGateId] = useState<string | null>(initialGateId);
  const [mode, setMode] = useState<"home" | "scanning" | "verifying" | "verified" | "reference">("home");
  const [verified, setVerified] = useState<Verified | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuestCard[] | null>(null);
  const [chosen, setChosen] = useState<GuestCard | null>(null);
  const [searching, setSearching] = useState(false);
  const gate = gates.find((g) => g.id === gateId) ?? null;
  // The gate is optional: it is only recorded for reports, never required.
  const needsGate = false;

  useEffect(() => {
    if (gateId) setGateCookie(gateId);
  }, [gateId]);

  // Scanned -> verify automatically (read-only); attendance needs Confirm.
  const onToken = useCallback(
    async (token: string) => {
      setMode("verifying");
      setVerifyError(null);
      try {
        const res = await fetch("/api/v1/check-in/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, gateId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Verification failed");
        setVerified({ token, result: json.data });
        setMode("verified");
      } catch (err) {
        setVerifyError(`${(err as Error).message}. Do not admit on an unverified result; try again.`);
        setMode("home");
      }
    },
    [gateId]
  );

  async function verifyChosen(g: GuestCard) {
    setMode("verifying");
    setVerifyError(null);
    try {
      const res = await fetch("/api/v1/check-in/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, eventGuestId: g.eventGuestId, gateId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Verification failed");
      setVerified({ token: "", result: json.data });
      setChosen(g);
      setMode("verified");
    } catch (err) {
      setVerifyError(`${(err as Error).message}. Try again.`);
      setMode("reference");
    }
  }

  function reset() {
    setVerified(null);
    setChosen(null);
    setResults(null);
    setQuery("");
    setMode("home");
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setChosen(null);
    try {
      const res = await fetch(`/api/v1/check-in/lookup?eventId=${encodeURIComponent(event.id)}&q=${encodeURIComponent(query)}`);
      const json = await res.json().catch(() => ({}));
      const list: GuestCard[] = res.ok ? json.data : [];
      setResults(list);
      // An exact reference that matches one guest goes straight to verification.
      if (list.length === 1 && [list[0].reference, list[0].seat].some((v) => v && v.toLowerCase().includes(query.trim().toLowerCase()))) {
        void verifyChosen(list[0]);
      }
    } finally {
      setSearching(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login?next=/usher");
  }

  const verifiedActionable = verified && ["VALID", "RSVP_DECLINED", "EVENT_NOT_ACTIVE", "EXPIRED", "REVOKED"].includes(verified.result.state);

  return (
    <main className="min-h-screen bg-brand-canvas p-4 max-w-[520px] mx-auto space-y-4">
      {mode === "scanning" && <QrScanner onToken={onToken} onClose={() => setMode("home")} />}

      <header className="panel dot-surface p-4">
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] text-brand-muted">Usher dashboard</p>
            <p className="text-[18px] font-medium leading-tight">{event.name}</p>
            <p className="text-[13px] text-brand-muted">{usherName}{gate ? ` · ${gate.name}` : ""}</p>
          </div>
          <button type="button" onClick={signOut} aria-label="Sign out" className="w-12 h-12 grid place-items-center rounded-[12px] bg-brand-soft">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        {event.status !== "active" && (
          <p className="relative mt-3 text-[13px] bg-brand-soft rounded-[10px] px-3 py-2">Check-in is not open: the event is {event.status}.</p>
        )}
      </header>

      {gates.length > 0 && (
        <section className="panel p-4 space-y-2">
          <label htmlFor="gate" className="block text-[13px] font-medium text-brand-ink">Your gate <span className="text-brand-muted font-normal">(optional)</span></label>
          <select id="gate" value={gateId ?? ""} onChange={(e) => setGateId(e.target.value || null)}
            className="w-full min-h-[52px] border border-brand-line2 rounded-[12px] px-3 text-[17px] bg-white text-brand-ink">
            <option value="">No gate</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>{g.name}{g.fastTrackEnabled ? " (fast-track)" : ""}</option>
            ))}
          </select>
        </section>
      )}

      {needsGate ? (
        <p role="alert" className="panel p-4 text-[15px] text-[#B54708]">Select your gate before checking guests in.</p>
      ) : (
        <>
          {verifyError && <p role="alert" className="panel p-4 text-[15px] text-[#B42318]">{verifyError}</p>}

          {(mode === "home" || mode === "reference") && (
            <div className="grid grid-cols-1 gap-3">
              <button type="button" onClick={() => { setVerifyError(null); setMode("scanning"); }}
                className="w-full min-h-[88px] rounded-[16px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[22px] font-semibold flex items-center justify-center gap-3">
                <Camera className="w-7 h-7" aria-hidden="true" /> Scan QR code
              </button>
              <button type="button" onClick={() => setMode(mode === "reference" ? "home" : "reference")} aria-expanded={mode === "reference"}
                className="w-full min-h-[64px] rounded-[16px] bg-white border-2 border-brand-line2 text-brand-ink text-[18px] font-medium flex items-center justify-center gap-3">
                <Search className="w-6 h-6" aria-hidden="true" /> Enter reference
              </button>
            </div>
          )}

          {mode === "verifying" && <p role="status" className="panel p-6 text-center text-[17px] text-brand-ink">Verifying pass…</p>}

          {mode === "verified" && verified && (
            <div className="space-y-3">
              {verifiedActionable ? (
                <ConfirmPanel
                  key={verified.token || chosen?.eventGuestId}
                  eventId={verified.result.event?.id ?? event.id}
                  gateId={gate?.id ?? null}
                  {...(verified.token ? { token: verified.token } : { eventGuestId: chosen?.eventGuestId })}
                  method={verified.token ? "qr" : "manual"}
                  fastTrack={!!gate?.fastTrackEnabled && !!verified.token}
                  canOverride={canOverride}
                  initial={{ state: verified.result.state, message: verified.result.message, guest: verified.result.guest }}
                />
              ) : (
                <ResultCard state={verified.result.state} message={verified.result.message} guest={verified.result.guest} existing={verified.result.existing} />
              )}
              <button type="button" onClick={() => { reset(); setMode("scanning"); }}
                className="w-full min-h-[60px] rounded-[14px] bg-[#2563EB] text-white text-[18px] font-semibold flex items-center justify-center gap-2">
                <Camera className="w-6 h-6" aria-hidden="true" /> Scan next guest
              </button>
              <button type="button" onClick={reset} className="w-full min-h-[48px] text-[15px] text-brand-muted flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" aria-hidden="true" /> Back to dashboard
              </button>
            </div>
          )}

          {mode === "reference" && (
            <section className="panel p-4 space-y-3">
              <form onSubmit={search} className="space-y-2">
                <label htmlFor="q" className="block text-[14px] font-medium text-brand-ink">
                  Guest reference, invitation reference, seat number or name
                </label>
                <div className="flex gap-2">
                  <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. GH-GST-7K3QX9PA or SEC-A-R1-S3"
                    autoCapitalize="characters" autoComplete="off" minLength={2}
                    className="flex-1 min-h-[52px] border border-brand-line2 rounded-[12px] px-3 text-[16px]" />
                  <button type="submit" disabled={searching || query.trim().length < 2} className="min-h-[52px] px-4 rounded-[12px] bg-[#2563EB] text-white text-[16px] disabled:opacity-50">
                    {searching ? "…" : "Verify"}
                  </button>
                </div>
              </form>
              {results && results.length > 0 && !chosen && (
                <ul className="divide-y divide-brand-line">
                  {results.map((g) => (
                    <li key={g.eventGuestId}>
                      <button type="button" onClick={() => verifyChosen(g)} className="w-full text-left py-3 min-h-[52px]">
                        <span className="block text-[16px] font-medium text-brand-ink">{g.displayName}</span>
                        <span className="block text-[13px] text-brand-muted">{[g.category?.name, g.seat, g.reference].filter(Boolean).join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {results && results.length === 0 && !searching && (
                <p className="text-[14px] text-brand-muted">No invitation found. Check the reference or refer to a supervisor.</p>
              )}
            </section>
          )}

        </>
      )}
    </main>
  );
}
