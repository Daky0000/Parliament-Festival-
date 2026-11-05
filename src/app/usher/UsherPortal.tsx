"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Search, LogOut, QrCode } from "lucide-react";
import { ConfirmPanel } from "@/components/checkin/ConfirmPanel";
import type { GuestCard } from "@/lib/checkin";

type Gate = { id: string; name: string; fastTrackEnabled: boolean };

function setGateCookie(id: string) {
  // A preference only; the server re-checks the gate assignment on every request.
  document.cookie = `pf_gate=${encodeURIComponent(id)}; Path=/; SameSite=Lax; Max-Age=43200${location.protocol === "https:" ? "; Secure" : ""}`;
}

type BarcodeDetectorLike = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuestCard[]>([]);
  const [chosen, setChosen] = useState<GuestCard | null>(null);
  const [searching, setSearching] = useState(false);
  const [scannerOn, setScannerOn] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasDetector = typeof window !== "undefined" && "BarcodeDetector" in window;
  const gate = gates.find((g) => g.id === gateId) ?? null;
  const needsGate = gates.length > 0 && !gate;

  useEffect(() => {
    if (gateId) setGateCookie(gateId);
  }, [gateId]);

  // Optional in-page scanner. The phone's own camera app works everywhere and
  // is the recommended path; this is a convenience where supported.
  useEffect(() => {
    if (!scannerOn) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        while (!stop) {
          const codes = await detector.detect(videoRef.current).catch(() => []);
          const hit = codes.map((c) => c.rawValue).find((v) => {
            try {
              const u = new URL(v);
              return u.origin === location.origin && u.pathname.startsWith("/check-in/scan/");
            } catch {
              return false;
            }
          });
          if (hit) {
            stop = true;
            router.push(new URL(hit).pathname);
            return;
          }
          if (codes.length) setScannerError("That code is not an event pass for this system.");
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setScannerError("Camera unavailable. Use your phone's camera app or manual lookup.");
        setScannerOn(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scannerOn, router]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setChosen(null);
    try {
      const res = await fetch(`/api/v1/check-in/lookup?eventId=${encodeURIComponent(event.id)}&q=${encodeURIComponent(query)}`);
      const json = await res.json().catch(() => ({}));
      setResults(res.ok ? json.data : []);
    } finally {
      setSearching(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login?next=/usher");
  }

  return (
    <main className="min-h-screen bg-brand-canvas p-4 max-w-[520px] mx-auto space-y-4">
      <header className="band p-4">
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] text-white/70">Usher portal</p>
            <p className="text-[18px] font-medium leading-tight">{event.name}</p>
            <p className="text-[13px] text-white/70">{usherName}</p>
          </div>
          <button type="button" onClick={signOut} aria-label="Sign out" className="w-12 h-12 grid place-items-center rounded-[12px] bg-white/10">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        {event.status !== "active" && (
          <p className="relative mt-3 text-[13px] bg-white/10 rounded-[10px] px-3 py-2">Check-in is not open: the event is {event.status}.</p>
        )}
      </header>

      <section className="panel p-4 space-y-2" aria-labelledby="gate-label">
        <label id="gate-label" htmlFor="gate" className="block text-[13px] font-medium text-brand-ink">Your gate</label>
        {gates.length === 0 ? (
          <p className="text-[14px] text-brand-muted">This event has no gates configured.</p>
        ) : (
          <select id="gate" value={gateId ?? ""} onChange={(e) => setGateId(e.target.value || null)}
            className="w-full min-h-[52px] border border-brand-line2 rounded-[12px] px-3 text-[17px] bg-white text-brand-ink">
            <option value="">Select your gate…</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>{g.name}{g.fastTrackEnabled ? " (fast-track)" : ""}</option>
            ))}
          </select>
        )}
      </section>

      {needsGate ? (
        <p role="alert" className="panel p-4 text-[15px] text-[#B54708]">Select your gate before checking guests in.</p>
      ) : (
        <>
          <section className="panel p-4 space-y-3">
            <h2 className="text-[16px] font-medium text-brand-ink flex items-center gap-2">
              <QrCode className="w-5 h-5 text-brand-blue" aria-hidden="true" /> Scan a pass
            </h2>
            <ol className="list-decimal pl-5 text-[15px] text-brand-ink space-y-1">
              <li>Open your phone&rsquo;s camera and point it at the guest&rsquo;s QR code.</li>
              <li>Tap the link that appears. The guest&rsquo;s details open here.</li>
              <li>Check the guest, then tap <strong>Confirm attendance</strong>.</li>
            </ol>
            {hasDetector && (
              <button type="button" onClick={() => { setScannerError(null); setScannerOn((v) => !v); }}
                className="w-full min-h-[52px] rounded-[12px] border border-brand-line2 text-[16px] text-brand-ink flex items-center justify-center gap-2">
                <Camera className="w-5 h-5" aria-hidden="true" /> {scannerOn ? "Stop in-page scanner" : "Use in-page scanner"}
              </button>
            )}
            {scannerOn && <video ref={videoRef} className="w-full rounded-[12px] bg-black aspect-square object-cover" muted playsInline />}
            {scannerError && <p role="alert" className="text-[14px] text-[#B42318]">{scannerError}</p>}
          </section>

          <section className="panel p-4 space-y-3">
            <h2 className="text-[16px] font-medium text-brand-ink flex items-center gap-2">
              <Search className="w-5 h-5 text-brand-blue" aria-hidden="true" /> Manual lookup
            </h2>
            <form onSubmit={search} className="flex gap-2">
              <label htmlFor="q" className="sr-only">Name, organisation or reference</label>
              <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, organisation or reference" minLength={2}
                className="flex-1 min-h-[52px] border border-brand-line2 rounded-[12px] px-3 text-[16px]" />
              <button type="submit" disabled={searching || query.trim().length < 2} className="min-h-[52px] px-4 rounded-[12px] bg-[#2563EB] text-white text-[16px] disabled:opacity-50">
                {searching ? "…" : "Search"}
              </button>
            </form>
            {results.length > 0 && !chosen && (
              <ul className="divide-y divide-brand-line">
                {results.map((g) => (
                  <li key={g.eventGuestId}>
                    <button type="button" onClick={() => setChosen(g)} className="w-full text-left py-3 min-h-[52px]">
                      <span className="block text-[16px] font-medium text-brand-ink">{g.displayName}</span>
                      <span className="block text-[13px] text-brand-muted">{[g.category?.name, g.institution, g.reference].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {results.length === 0 && query && !searching && <p className="text-[14px] text-brand-muted">No match. Check the spelling or refer to a supervisor.</p>}
            {chosen && (
              <div className="space-y-2">
                <ConfirmPanel
                  key={chosen.eventGuestId}
                  eventId={event.id}
                  gateId={gate?.id ?? null}
                  eventGuestId={chosen.eventGuestId}
                  method="manual"
                  fastTrack={false}
                  canOverride={canOverride}
                  initial={{ state: "VALID", message: "Confirm only after checking the guest's identity.", guest: chosen }}
                />
                <button type="button" onClick={() => setChosen(null)} className="w-full min-h-[48px] text-[15px] text-brand-muted">Back to results</button>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
