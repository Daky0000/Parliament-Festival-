"use client";

import { useEffect, useState, use } from "react";
import { PoweredBy } from "@/components/brand/PoweredBy";
import {
  CheckCircle2,
  XCircle,
  Calendar,
  MapPin,
  Clock,
  Armchair,
  Award,
  AlertCircle,
  Loader2,
  Users,
  Hash,
  RefreshCw,
} from "lucide-react";

type Invitation = {
  invitationReference: string;
  eventName: string;
  eventVenue: string | null;
  eventAddress: string | null;
  eventStartsAt: string | null;
  rsvpDeadline: string | null;
  acceptingResponses: boolean;
  guestTitle: string | null;
  guestFullName: string;
  designation: string | null;
  institution: string | null;
  protocolCategory: string | null;
  rankOrder: number | null;
  rankColour: string | null;
  seat: { section: string; seatCode: string | null } | null;
  guestReference: string | null;
  companionAllowance: number;
  currentRsvp: { response: string; companionCount: number; confirmationReference: string; submittedAt: string } | null;
  qrCodeDataUrl: string | null;
};

type Confirmation = { confirmationReference: string; response: string; companionCount: number; qrCodeDataUrl: string | null };

const TZ = "Africa/Accra";
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ }) : "Friday, 18 December 2026";
const fmtTime = (iso: string | null) =>
  iso ? `${new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ }).toUpperCase()} GMT` : "4:00 PM GMT";

function Mark() {
  return (
    <span aria-hidden="true" className="w-11 h-11 flex-none rounded-full bg-brand-navy text-white grid place-items-center">
      <svg viewBox="0 0 24 24" className="w-[55%] h-[55%]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5 12 4l9 5.5" />
        <path d="M4.5 10h15" />
        <path d="M6.5 10v7.5M10 10v7.5M14 10v7.5M17.5 10v7.5" />
        <path d="M4 20h16" />
      </svg>
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-brand-canvas px-3 py-6 sm:py-10 flex justify-center font-sans text-brand-ink">
      <div className="w-full max-w-[600px] space-y-2">
        {children}
        <PoweredBy className="pt-4 pb-2" showPhone />
      </div>
    </main>
  );
}

function Row({ icon: Icon, k, children }: { icon: typeof Calendar; k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[150px_1fr] gap-3 py-3 border-b border-brand-line text-[15px]">
      <dt className="flex items-center gap-2 text-brand-muted">
        <Icon className="w-4 h-4 text-brand-blue flex-none" />
        {k}
      </dt>
      <dd className="font-medium text-brand-ink min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default function PublicRsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [selectedResponse, setSelectedResponse] = useState<"accepted" | "declined">("accepted");
  const [companionCount, setCompanionCount] = useState(0);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Retries quietly so a brief network or server hiccup never shows the guest an error.
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch(`/api/v1/public/invitations/${token}`);
          const json = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (res.ok && json.data) {
            const data = json.data as Invitation;
            setInvitation(data);
            setLoadError(null);
            if (data.currentRsvp) {
              setConfirmation({ ...data.currentRsvp, qrCodeDataUrl: data.qrCodeDataUrl });
              setSelectedResponse(data.currentRsvp.response === "declined" ? "declined" : "accepted");
              setCompanionCount(data.currentRsvp.companionCount);
            }
            fetch(`/api/v1/public/invitations/${token}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "view" }),
            }).catch(() => {});
            setIsLoading(false);
            return;
          }
          if (res.status === 404 || res.status === 410) {
            setLoadError(json.error || "This invitation link is not valid.");
            setIsLoading(false);
            return;
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
      }
      if (!cancelled) {
        setLoadError("We could not open your invitation just now. Please try again in a moment.");
        setIsLoading(false);
      }
    }
    setIsLoading(true);
    load();
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      let lastError = "We could not record your response. Please try again.";
      for (let i = 0; i < 2; i++) {
        const res = await fetch(`/api/v1/public/invitations/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "rsvp",
            response: selectedResponse,
            companionCount: selectedResponse === "accepted" ? companionCount : 0,
            notes: notes.trim() || undefined,
          }),
        }).catch(() => null);
        const json = res ? await res.json().catch(() => ({})) : {};
        if (res?.ok && json.data) {
          setConfirmation(json.data);
          setChanging(false);
          return;
        }
        if (res && res.status < 500) {
          lastError = json.error || lastError;
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setSubmitError(lastError);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Shell>
        <section className="panel dot-surface p-10 grid place-items-center text-center">
          <Loader2 className="w-7 h-7 text-brand-blue animate-spin" />
          <p className="mt-3 text-[14px] text-brand-muted">Opening your invitation…</p>
        </section>
      </Shell>
    );
  }

  if (loadError || !invitation) {
    return (
      <Shell>
        <section className="panel dot-surface p-8 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-brand-blue mx-auto" />
          <h1 className="text-[22px] font-light tracking-[-0.02em]">We could not open this invitation</h1>
          <p className="text-[14.5px] text-brand-muted">{loadError}</p>
          <button
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-brand-blue hover:bg-brand-blueDark text-white text-[14px] font-medium"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
          <p className="text-[13px] text-brand-muted pt-1">
            Or contact Protocol Services: <a className="text-brand-blue" href="mailto:protocol@parliament.gh">protocol@parliament.gh</a>
          </p>
        </section>
      </Shell>
    );
  }

  const name = [
    invitation.guestTitle && !invitation.guestFullName.toLowerCase().startsWith(invitation.guestTitle.toLowerCase()) ? invitation.guestTitle : null,
    invitation.guestFullName,
  ]
    .filter(Boolean)
    .join(" ");
  const affiliation = [invitation.designation, invitation.institution].filter(Boolean).join(" · ");
  const rank = invitation.protocolCategory ? `${invitation.rankOrder != null ? `Rank ${invitation.rankOrder} · ` : ""}${invitation.protocolCategory}` : null;
  const seat = invitation.seat ? `${invitation.seat.section}${invitation.seat.seatCode ? ` · ${invitation.seat.seatCode}` : ""}` : null;
  const venue = [invitation.eventVenue, invitation.eventAddress].filter(Boolean).join(", ") || "Forecourt of Parliament House, Accra";
  const showForm = !confirmation || changing;

  return (
    <Shell>
      {/* Header */}
      <header className="panel dot-surface px-6 sm:px-9 py-7" style={invitation.rankColour ? { borderTop: `6px solid ${invitation.rankColour}` } : undefined}>
        <div className="flex items-center gap-3">
          <Mark />
          <div className="leading-tight">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-brand-muted">Parliament of Ghana</p>
            <p className="text-[13px] text-brand-muted">Office of the Rt. Hon. Speaker</p>
          </div>
        </div>
        <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.16em] text-brand-blue">State Invitation</p>
        <h1 className="mt-1 text-[28px] sm:text-[34px] leading-[1.08] font-light tracking-[-0.035em]">{invitation.eventName}</h1>
      </header>

      {/* Invitation */}
      <section className="panel px-6 sm:px-9 pt-8 pb-6">
        <p className="text-[15.5px] leading-relaxed text-brand-muted">
          The Rt. Hon. Speaker and the Leadership of Parliament request the honour of the presence of
        </p>
        <p className="mt-4 text-[30px] sm:text-[36px] leading-[1.1] font-light tracking-[-0.035em]">{name}</p>
        {affiliation && <p className="mt-1.5 text-[15px] text-brand-muted">{affiliation}</p>}
        {rank && (
          <span className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-brand-soft px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-brand-ink">
            <span className="w-2 h-2 rounded-full" style={{ background: invitation.rankColour ?? "#091833" }} />
            {rank}
          </span>
        )}
        <dl className="mt-6 border-t border-brand-line">
          <Row icon={Calendar} k="Date">{fmtDate(invitation.eventStartsAt)}</Row>
          <Row icon={Clock} k="Time">{fmtTime(invitation.eventStartsAt)}</Row>
          <Row icon={MapPin} k="Venue">{venue}</Row>
          {invitation.rsvpDeadline && <Row icon={Clock} k="Please reply by">{fmtDate(invitation.rsvpDeadline)}</Row>}
          <Row icon={Hash} k="Reference">
            <span className="font-mono text-brand-blue">{invitation.invitationReference}</span>
          </Row>
        </dl>
      </section>

      {/* Response */}
      {showForm ? (
        <section className="panel px-6 sm:px-9 py-7">
          {!invitation.acceptingResponses ? (
            <p className="text-[15px] text-brand-muted">
              Responses are closed for this event. Please contact Protocol Services if you need to change your attendance.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <span className="cap">Your response</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Your response">
                {(
                  [
                    { v: "accepted", label: "I will attend", sub: "Accept with honour", Icon: CheckCircle2 },
                    { v: "declined", label: "I cannot attend", sub: "Regretfully decline", Icon: XCircle },
                  ] as const
                ).map(({ v, label, sub, Icon }) => {
                  const on = selectedResponse === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSelectedResponse(v)}
                      className={`text-left rounded-[14px] border-2 px-4 py-4 flex items-center gap-3 transition-colors ${
                        on ? (v === "accepted" ? "border-brand-blue bg-brand-pale" : "border-brand-ink bg-brand-soft") : "border-brand-line bg-white hover:border-brand-line2"
                      }`}
                    >
                      <Icon className={`w-6 h-6 flex-none ${on ? (v === "accepted" ? "text-brand-blue" : "text-brand-ink") : "text-brand-faint"}`} />
                      <span>
                        <span className="block text-[16px] font-medium">{label}</span>
                        <span className="block text-[13px] text-brand-muted">{sub}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedResponse === "accepted" && invitation.companionAllowance > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-[14px] font-medium mb-2">
                    <Users className="w-4 h-4 text-brand-blue" /> Companions attending with you
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: invitation.companionAllowance + 1 }, (_, i) => i).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCompanionCount(n)}
                        aria-pressed={companionCount === n}
                        className={`min-w-[52px] px-3 py-2.5 rounded-[10px] border text-[15px] font-medium ${
                          companionCount === n ? "bg-brand-navy border-brand-navy text-white" : "bg-white border-brand-line hover:border-brand-line2"
                        }`}
                      >
                        {n === 0 ? "None" : n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="notes" className="block text-[14px] font-medium mb-2">
                  Note for the Protocol Office <span className="text-brand-muted font-normal">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  rows={2}
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. accessibility needs"
                  className="w-full border border-brand-line2 rounded-[10px] px-3 py-2.5 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              {submitError && (
                <p role="alert" className="text-[14px] text-brand-danger bg-brand-dangerBg rounded-[10px] px-3 py-2">
                  {submitError}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 min-h-[52px] rounded-[12px] bg-brand-blue hover:bg-brand-blueDark disabled:opacity-60 text-white text-[16px] font-medium inline-flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? "Sending…" : selectedResponse === "accepted" ? "Confirm my attendance" : "Send my apologies"}
                </button>
                {changing && (
                  <button type="button" onClick={() => setChanging(false)} className="min-h-[52px] px-5 rounded-[12px] border border-brand-line text-[15px]">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      ) : confirmation!.response === "accepted" ? (
        <section className="panel dot-surface px-6 sm:px-9 py-7 space-y-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-8 h-8 text-brand-positive flex-none" />
            <div>
              <h2 className="text-[22px] font-light tracking-[-0.02em]">Thank you. Your attendance is confirmed.</h2>
              <p className="mt-1 text-[14.5px] text-brand-muted">
                We look forward to welcoming you. If we have your mobile number, a confirmation SMS is on its way. Please show the pass below, or that SMS, to the usher on arrival.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center rounded-[14px] border border-brand-line p-4">
            <div className="mx-auto">
              {confirmation!.qrCodeDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={confirmation!.qrCodeDataUrl} alt="Your event pass QR code" width={176} height={176} className="w-44 h-44 block" />
              ) : (
                <div className="w-44 h-44 grid place-items-center rounded-[10px] bg-brand-soft text-[12px] text-brand-muted text-center p-3">
                  Your pass is being prepared. Please refresh shortly.
                </div>
              )}
            </div>
            <dl className="text-[14px] space-y-2.5">
              <div>
                <dt className="cap !text-[10.5px]">Confirmation code</dt>
                <dd className="font-mono text-[17px] font-semibold text-brand-blue">{confirmation!.confirmationReference}</dd>
              </div>
              {rank && (
                <div>
                  <dt className="cap !text-[10.5px]">Rank</dt>
                  <dd className="font-medium flex items-center gap-1.5"><Award className="w-4 h-4 text-brand-blue" />{rank}</dd>
                </div>
              )}
              <div>
                <dt className="cap !text-[10.5px]">Seat</dt>
                <dd className="font-medium flex items-center gap-1.5"><Armchair className="w-4 h-4 text-brand-blue" />{seat ?? "Allocated on arrival"}</dd>
              </div>
              <div>
                <dt className="cap !text-[10.5px]">Guests</dt>
                <dd className="font-medium">{confirmation!.companionCount > 0 ? `You + ${confirmation!.companionCount}` : "You only"}</dd>
              </div>
              {invitation.guestReference && (
                <div>
                  <dt className="cap !text-[10.5px]">Guest reference</dt>
                  <dd className="font-mono">{invitation.guestReference}</dd>
                </div>
              )}
            </dl>
          </div>
          {invitation.acceptingResponses && (
            <button onClick={() => setChanging(true)} className="text-[14px] text-brand-blue underline underline-offset-2">
              Change my response
            </button>
          )}
        </section>
      ) : (
        <section className="panel px-6 sm:px-9 py-7 space-y-3">
          <div className="flex items-start gap-3">
            <XCircle className="w-7 h-7 text-brand-muted flex-none" />
            <div>
              <h2 className="text-[22px] font-light tracking-[-0.02em]">Thank you for letting us know.</h2>
              <p className="mt-1 text-[14.5px] text-brand-muted">
                We have recorded that you are unable to attend. Reference <span className="font-mono">{confirmation!.confirmationReference}</span>.
              </p>
            </div>
          </div>
          {invitation.acceptingResponses && (
            <button onClick={() => setChanging(true)} className="text-[14px] text-brand-blue underline underline-offset-2">
              I can attend after all
            </button>
          )}
        </section>
      )}
    </Shell>
  );
}
