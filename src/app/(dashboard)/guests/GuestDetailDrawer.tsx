"use client";

import { useEffect, useState } from "react";
import {
  X,
  Mail,
  Phone,
  Building2,
  Award,
  Armchair,
  CheckCircle2,
  Clock,
  XCircle,
  Send,
  Eye,
  MailOpen,
  MousePointerClick,
  Globe,
  MailX,
  Loader2,
  UserCheck,
  Hash,
} from "lucide-react";
import type { EmailTracking } from "@/lib/email/tracking-summary";

type Detail = {
  id: string;
  guestReference: string | null;
  title: string | null;
  fullName: string;
  designation: string | null;
  institution: string | null;
  email: string | null;
  phone: string | null;
  companionAllowance: number;
  operationalNotes: string | null;
  addedAt: string;
  rank: { name: string; order: number; colour: string } | null;
  seat: { section: string; seatCode: string | null; status: string } | null;
  invitationReference: string | null;
  rsvp: { response: string; companions: number; at: string; reference: string } | null;
  checkin: { status: string; at: string; gate: string | null } | null;
  tracking: EmailTracking;
  sends: Array<{
    id: string;
    invitationReference: string;
    attemptNumber: number;
    recipientEmail: string;
    status: string;
    via: "campaign" | "direct";
    submittedAt: string | null;
    deliveredAt: string | null;
    createdAt: string;
    error: string | null;
    opens: number;
    clicks: number;
  }>;
  activity: Array<{ id: string; type: string; label: string; at: string; source: string | null }>;
};

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const SEND_STATUS: Record<string, { label: string; cls: string }> = {
  submitted: { label: "Sent", cls: "bg-brand-pale text-brand-blue" },
  delivered: { label: "Delivered", cls: "bg-brand-pale text-brand-blue" },
  deferred: { label: "Delayed", cls: "bg-amber-100 text-amber-800" },
  bounced: { label: "Bounced", cls: "bg-brand-dangerBg text-brand-danger" },
  rejected: { label: "Rejected", cls: "bg-brand-dangerBg text-brand-danger" },
  failed: { label: "Failed", cls: "bg-brand-dangerBg text-brand-danger" },
  queued: { label: "Queued", cls: "bg-brand-soft text-brand-muted" },
};

const ACTIVITY_ICON: Record<string, typeof Mail> = {
  submitted: Send,
  delivered: Mail,
  open_signal: MailOpen,
  click: MousePointerClick,
  link_access: Globe,
  bounced: MailX,
  failed: MailX,
  rejected: MailX,
  complaint: MailX,
  deferred: Clock,
};

function Stat({ label, value, tone = "ink" }: { label: string; value: string | number; tone?: "ink" | "positive" | "blue" }) {
  const c = tone === "positive" ? "text-brand-positive" : tone === "blue" ? "text-brand-blue" : "text-brand-ink";
  return (
    <div className="rounded-[14px] bg-brand-soft px-3 py-2.5">
      <span className="cap !text-[10.5px]">{label}</span>
      <p className={`mt-0.5 text-[20px] font-light tracking-[-0.02em] ${c}`}>{value}</p>
    </div>
  );
}

function Row({ icon: Icon, k, children }: { icon: typeof Mail; k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 border-b border-brand-line text-[13px]">
      <dt className="flex items-center gap-2 text-brand-muted">
        <Icon className="w-3.5 h-3.5 text-brand-blue flex-none" />
        {k}
      </dt>
      <dd className="text-brand-ink min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function GuestDetailDrawer({
  guestId,
  reloadKey,
  canSendEmail,
  sending,
  onClose,
  onSend,
  onViewPass,
}: {
  guestId: string;
  reloadKey: number;
  canSendEmail: boolean;
  sending: boolean;
  onClose: () => void;
  onSend: () => void;
  onViewPass: () => void;
}) {
  const [detail, setDetail] = useState<{ id: string; data: Detail } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/guests/${guestId}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok) {
          setDetail({ id: guestId, data: body.data });
          setError(null);
        } else setError(body.error || "Could not load this dignitary.");
      })
      .catch(() => !cancelled && setError("Network error."));
    return () => {
      cancelled = true;
    };
  }, [guestId, reloadKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = detail?.id === guestId ? detail.data : null;
  const name = d ? [d.title && !d.fullName.startsWith(d.title) ? d.title : null, d.fullName].filter(Boolean).join(" ") : "";
  const t = d?.tracking;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-brand-navy/50 backdrop-blur-[2px]" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Dignitary details"
        className="h-full w-full max-w-[520px] bg-brand-canvas p-2 flex flex-col gap-2 overflow-y-auto shadow-float"
      >
        {/* Header */}
        <div className="panel dot-surface px-5 py-5 flex-none">
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-blue">Dignitary</span>
              <h2 className="mt-1 text-[24px] leading-[1.15] font-light tracking-[-0.03em] text-brand-ink">{d ? name : "Loading…"}</h2>
              {d && (d.designation || d.institution) && (
                <p className="mt-1 text-[13.5px] text-brand-muted">{[d.designation, d.institution].filter(Boolean).join(" · ")}</p>
              )}
              {d?.rank && (
                <span className="mt-3 inline-flex items-center gap-2 rounded-[10px] bg-brand-soft px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-brand-ink">
                  <span className="w-2 h-2 rounded-full" style={{ background: d.rank.colour }} />
                  Rank {d.rank.order} · {d.rank.name}
                </span>
              )}
            </div>
            <button onClick={onClose} aria-label="Close" className="w-9 h-9 flex-none rounded-[10px] bg-brand-soft hover:bg-brand-line text-brand-ink grid place-items-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          {d && (
            <div className="relative mt-4 flex flex-wrap gap-2">
              {canSendEmail && (
                <button
                  onClick={onSend}
                  disabled={!d.email || sending}
                  className="px-3 py-2 rounded-[10px] bg-brand-blue hover:bg-brand-blueDark disabled:opacity-40 text-white text-[12.5px] font-medium flex items-center gap-1.5"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {sending ? "Sending…" : d.sends.length ? "Resend invitation" : "Send invitation"}
                </button>
              )}
              <button onClick={onViewPass} className="px-3 py-2 rounded-[10px] bg-brand-soft hover:bg-brand-line text-brand-ink text-[12.5px] font-medium flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                View pass
              </button>
            </div>
          )}
        </div>

        {error && <div className="bg-brand-dangerBg text-brand-danger rounded-[14px] px-4 py-3 text-[13px]">{error}</div>}
        {!d && !error && (
          <div className="bg-white rounded-[22px] p-8 grid place-items-center text-brand-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {d && t && (
          <>
            {/* Email summary */}
            <section className="bg-white rounded-[22px] p-5">
              <span className="cap">Invitation email</span>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Times sent" value={t.sendCount} tone="blue" />
                <Stat label="Opens" value={t.openCount} tone={t.openCount ? "positive" : "ink"} />
                <Stat label="RSVP link" value={t.clicked ? "Used" : "No"} tone={t.clicked ? "positive" : "ink"} />
              </div>
              <dl className="mt-3 border-t border-brand-line">
                <Row icon={Send} k="Last sent">{fmt(t.lastSentAt)}</Row>
                <Row icon={MailOpen} k="First opened">{t.firstOpenedAt ? fmt(t.firstOpenedAt) : "Not opened yet"}</Row>
                <Row icon={Clock} k="Last opened">{fmt(t.lastOpenedAt)}</Row>
                {t.lastError && <Row icon={MailX} k="Last error"><span className="text-brand-danger">{t.lastError}</span></Row>}
              </dl>
              {t.sendCount === 0 && <p className="mt-3 text-[13px] text-brand-muted">No invitation email has been sent to this dignitary yet.</p>}
            </section>

            {/* Send history */}
            {d.sends.length > 0 && (
              <section className="bg-white rounded-[22px] p-5">
                <span className="cap">Send history ({d.sends.length})</span>
                <ul className="mt-3 space-y-2">
                  {d.sends.map((s) => {
                    const st = SEND_STATUS[s.status] ?? { label: s.status, cls: "bg-brand-soft text-brand-muted" };
                    return (
                      <li key={s.id} className="rounded-[14px] border border-brand-line px-3.5 py-3 text-[12.5px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-brand-ink">{fmt(s.submittedAt ?? s.createdAt)}</span>
                          <span className={`px-2 py-0.5 rounded-[10px] text-[10.5px] font-medium ${st.cls}`}>{st.label}</span>
                        </div>
                        <div className="mt-1 text-brand-muted flex flex-wrap gap-x-3 gap-y-0.5">
                          <span className="font-mono">{s.recipientEmail}</span>
                          <span>{s.via === "campaign" ? "Campaign" : "Sent individually"}</span>
                          {s.deliveredAt && <span>Delivered {fmt(s.deliveredAt)}</span>}
                          <span className={s.opens ? "text-brand-positive" : ""}>{s.opens} open{s.opens === 1 ? "" : "s"}</span>
                          {s.clicks > 0 && <span className="text-brand-positive">{s.clicks} click{s.clicks === 1 ? "" : "s"}</span>}
                        </div>
                        {s.error && <p className="mt-1 text-brand-danger">{s.error}</p>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Activity */}
            {d.activity.length > 0 && (
              <section className="bg-white rounded-[22px] p-5">
                <span className="cap">Email activity</span>
                <ol className="mt-3 space-y-0">
                  {d.activity.slice(0, 50).map((a) => {
                    const Icon = ACTIVITY_ICON[a.type] ?? Mail;
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2 border-b border-brand-line last:border-0 text-[12.5px]">
                        <span className="w-7 h-7 flex-none rounded-[10px] bg-brand-soft grid place-items-center text-brand-blue">
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="flex-1 text-brand-ink">{a.label}</span>
                        <span className="text-brand-muted">{fmt(a.at)}</span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {/* Profile */}
            <section className="bg-white rounded-[22px] p-5">
              <span className="cap">Details</span>
              <dl className="mt-2 border-t border-brand-line">
                <Row icon={Hash} k="Reference"><span className="font-mono text-brand-blue">{d.guestReference ?? "—"}</span></Row>
                <Row icon={Hash} k="Invitation ref"><span className="font-mono">{d.invitationReference ?? "—"}</span></Row>
                <Row icon={Mail} k="Email"><span className="font-mono">{d.email ?? "No email"}</span></Row>
                <Row icon={Phone} k="Phone"><span className="font-mono">{d.phone ?? "No phone"}</span></Row>
                <Row icon={Building2} k="Institution">{d.institution ?? "—"}</Row>
                <Row icon={Award} k="Designation">{d.designation ?? "—"}</Row>
                <Row icon={Armchair} k="Seat">
                  {d.seat ? `${d.seat.section}${d.seat.seatCode ? ` · ${d.seat.seatCode}` : ""}` : "Not seated"}
                </Row>
                <Row icon={UserCheck} k="Companions">{d.companionAllowance > 0 ? `Up to ${d.companionAllowance}` : "None"}</Row>
                <Row icon={d.rsvp?.response === "accepted" ? CheckCircle2 : d.rsvp?.response === "declined" ? XCircle : Clock} k="RSVP">
                  {d.rsvp
                    ? `${d.rsvp.response === "accepted" ? `Accepted (+${d.rsvp.companions})` : d.rsvp.response === "declined" ? "Declined" : d.rsvp.response} · ${fmt(d.rsvp.at)}`
                    : "No response yet"}
                </Row>
                <Row icon={UserCheck} k="Check-in">
                  {d.checkin && d.checkin.status === "checked_in" ? `Arrived ${fmt(d.checkin.at)}${d.checkin.gate ? ` · ${d.checkin.gate}` : ""}` : "Not arrived"}
                </Row>
                {d.operationalNotes && <Row icon={Award} k="Notes">{d.operationalNotes}</Row>}
                <Row icon={Clock} k="Added">{fmt(d.addedAt)}</Row>
              </dl>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
