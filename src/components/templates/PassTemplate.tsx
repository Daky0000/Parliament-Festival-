"use client";

import React, { useMemo, useRef, useState } from "react";
import { INVITATION_HTML, INVITATION_SUBJECT } from "@/lib/email/invitation-template";
import { buildInvitationVars, fillTemplate } from "@/lib/email/render-invitation";
import { rankTheme } from "@/lib/email/rank-theme";
import { ShieldCheck, Calendar, Clock, MapPin, Armchair, Award, Building2, UserCheck, QrCode } from "lucide-react";

export interface TemplateData {
  guestTitle?: string | null;
  fullName: string;
  designation?: string | null;
  company: string;
  rankName: string;
  rankOrder: number;
  rankColourHex?: string;
  seatReference?: string | null;
  sectionName?: string | null;
  invitationReference?: string;
  guestReference?: string | null;
  companionAllowance?: number;
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  eventVenue?: string;
  qrCodeDataUrl?: string | null;
  qrLoading?: boolean;
}

// The two printed credentials, in the platform design system: Outfit, a white
// header with the subtle blue dot field (kept clear of the text), white panels on the cool grey canvas, one blue
// accent and the guest's protocol rank colour as the only other colour.

const DEFAULTS = {
  eventName: "2026 Festival of Nine Lessons and Carols",
  eventDate: "Friday, 18 December 2026",
  eventTime: "4:00 PM GMT",
  eventVenue: "Forecourt of Parliament House, Accra",
};

function Mark({ className = "w-10 h-10", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} flex-none rounded-full grid place-items-center ${
        tone === "light" ? "bg-white/10 text-white" : "bg-brand-navy text-white"
      }`}
    >
      <svg viewBox="0 0 24 24" className="w-[55%] h-[55%]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5 12 4l9 5.5" />
        <path d="M4.5 10h15" />
        <path d="M6.5 10v7.5M10 10v7.5M14 10v7.5M17.5 10v7.5" />
        <path d="M4 20h16" />
      </svg>
    </span>
  );
}

function QrBlock({ src, loading, size = 148 }: { src?: string | null; loading?: boolean; size?: number }) {
  return (
    <div className="bg-white rounded-[14px] border border-brand-line p-2.5 inline-block" style={{ width: size + 22, height: size + 22 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Pass QR code" width={size} height={size} className="block" style={{ width: size, height: size }} />
      ) : (
        <div className="w-full h-full grid place-items-center text-center rounded-[10px] bg-brand-soft text-brand-muted">
          <span className="flex flex-col items-center gap-1.5 px-2">
            <QrCode className="w-8 h-8 text-brand-faint" />
            <span className="text-[10.5px] leading-tight">{loading ? "Loading pass…" : "QR issued once a seat is assigned"}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export function PassTemplate({
  data,
  viewMode = "badge",
}: {
  data: TemplateData;
  viewMode?: "badge" | "card" | "email";
}) {
  const {
    guestTitle,
    fullName,
    designation,
    company,
    rankName,
    rankOrder,
    rankColourHex,
    seatReference,
    sectionName,
    invitationReference,
    guestReference,
    companionAllowance = 0,
    qrCodeDataUrl,
    qrLoading,
  } = data;
  const eventName = data.eventName || DEFAULTS.eventName;
  const eventDate = data.eventDate || DEFAULTS.eventDate;
  const eventTime = data.eventTime || DEFAULTS.eventTime;
  const eventVenue = data.eventVenue || DEFAULTS.eventVenue;

  const showTitle = guestTitle && !fullName.toLowerCase().startsWith(guestTitle.toLowerCase());
  const displayName = `${showTitle ? guestTitle + " " : ""}${fullName || "Honourable Dignitary"}`;
  const theme = rankTheme(rankColourHex, rankName, rankOrder);
  const rankBg = theme["guest.rank_color"];
  const rankText = theme["guest.rank_text"];
  const rankLabel = theme["guest.rank_label"];
  const admits = companionAllowance > 0 ? `Principal + ${companionAllowance}` : "Principal only";

  // 1. VIP SECURITY PASS — portrait, lanyard badge
  if (viewMode === "badge") {
    return (
      <div className="pass-print mx-auto w-full max-w-[360px] bg-brand-canvas rounded-[22px] p-2 font-sans text-brand-ink print:bg-white">
        <div className="panel dot-surface px-5 pt-3 pb-5">
          <div className="relative flex justify-center pb-4">
            <span className="w-14 h-[7px] rounded-full bg-brand-line2" aria-hidden="true" />
          </div>
          <div className="relative flex items-center gap-3">
            <Mark className="w-10 h-10" tone="dark" />
            <div className="min-w-0 leading-tight">
              <p className="text-[15px] font-medium tracking-[-0.01em] text-brand-ink">Parliament of Ghana</p>
              <p className="text-[11.5px] text-brand-muted">Protocol Directorate</p>
            </div>
          </div>
          <p className="relative mt-5 text-[11px] font-medium uppercase tracking-[0.16em] text-brand-blue">VIP Security Pass</p>
          <p className="relative mt-1 text-[19px] leading-[1.15] font-light tracking-[-0.03em] text-brand-ink">{eventName}</p>
        </div>

        <div className="mt-2 bg-white rounded-[22px] overflow-hidden">
          <div className="px-5 py-2.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ background: rankBg, color: rankText }}>
            <Award className="w-3.5 h-3.5 flex-none" />
            <span className="truncate">{rankLabel}</span>
          </div>

          <div className="px-5 pt-5 pb-4 text-center">
            <p className="text-[24px] leading-[1.12] font-light tracking-[-0.035em] text-brand-ink">{displayName}</p>
            {designation && <p className="mt-1.5 text-[13.5px] text-brand-muted">{designation}</p>}
            {company && (
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] bg-brand-soft px-2.5 py-1 text-[12px] text-brand-ink">
                <Building2 className="w-3.5 h-3.5 text-brand-blue" />
                {company}
              </span>
            )}
          </div>

          <div className="px-5 grid grid-cols-2 gap-2">
            <div className="rounded-[14px] bg-brand-soft px-3 py-2.5">
              <span className="cap !text-[10.5px]">Section</span>
              <p className="mt-0.5 text-[13.5px] font-medium leading-snug text-brand-ink">{sectionName || "To be assigned"}</p>
            </div>
            <div className="rounded-[14px] bg-brand-pale px-3 py-2.5">
              <span className="cap !text-[10.5px] !text-brand-blue">Seat</span>
              <p className={`mt-0.5 font-mono font-semibold text-brand-ink leading-snug [overflow-wrap:anywhere] ${(seatReference?.length ?? 0) > 12 ? "text-[12px]" : "text-[14px] tracking-wide"}`}>
                {seatReference || "—"}
              </p>
            </div>
          </div>

          <div className="px-5 pt-5 pb-4 flex flex-col items-center gap-2.5">
            <QrBlock src={qrCodeDataUrl} loading={qrLoading} />
            <p className="font-mono text-[12px] tracking-wider text-brand-blue">{guestReference || invitationReference}</p>
          </div>

          <div className="border-t border-brand-line px-5 py-3 flex items-center justify-between gap-3 text-[11.5px] text-brand-muted">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-blue" />
              Scan at the gate
            </span>
            <span className="flex items-center gap-1.5 font-medium text-brand-ink">
              <UserCheck className="w-3.5 h-3.5 text-brand-blue" />
              {admits}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 2. STATE INVITATION CARD — landscape, formal
  if (viewMode === "card") {
    const rows: Array<{ icon: React.ComponentType<{ className?: string }>; k: string; v: string; mono?: boolean }> = [
      { icon: Calendar, k: "Date", v: eventDate },
      { icon: Clock, k: "Time", v: eventTime },
      { icon: MapPin, k: "Venue", v: eventVenue },
      { icon: Armchair, k: "Reserved seat", v: [sectionName, seatReference].filter(Boolean).join(" · ") || "To be assigned" },
    ];
    return (
      <div className="pass-print mx-auto w-full max-w-[640px] bg-brand-canvas rounded-[22px] p-2 font-sans text-brand-ink print:bg-white">
        <div className="panel dot-surface px-6 sm:px-9 py-7">
          <div className="relative flex items-center gap-3">
            <Mark className="w-11 h-11" tone="dark" />
            <div className="leading-tight">
              <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-brand-muted">Parliament of Ghana</p>
              <p className="text-[13px] text-brand-muted">Office of the Rt. Hon. Speaker</p>
            </div>
          </div>
          <p className="relative mt-6 text-[11px] font-medium uppercase tracking-[0.16em] text-brand-blue">State Invitation</p>
          <h2 className="relative mt-1 text-[26px] sm:text-[32px] leading-[1.08] font-light tracking-[-0.035em] text-brand-ink">{eventName}</h2>
        </div>

        <div className="mt-2 bg-white rounded-[22px] px-6 sm:px-9 pt-8 pb-6">
          <p className="text-[15px] leading-relaxed text-brand-muted">
            The Rt. Hon. Speaker and the Leadership of Parliament request the honour of the presence of
          </p>
          <p className="mt-4 text-[28px] sm:text-[34px] leading-[1.1] font-light tracking-[-0.035em] text-brand-ink">{displayName}</p>
          {(designation || company) && (
            <p className="mt-1.5 text-[14.5px] text-brand-muted">{[designation, company].filter(Boolean).join(" · ")}</p>
          )}
          <span
            className="mt-4 inline-flex items-center gap-2 rounded-[10px] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em]"
            style={{ background: rankBg, color: rankText }}
          >
            <Award className="w-3.5 h-3.5" />
            {rankLabel}
          </span>

          <dl className="mt-6 border-t border-brand-line text-[14.5px]">
            {rows.map(({ icon: Icon, k, v }) => (
              <div key={k} className="grid grid-cols-[130px_1fr] sm:grid-cols-[170px_1fr] gap-3 py-3 border-b border-brand-line">
                <dt className="flex items-center gap-2 text-brand-muted">
                  <Icon className="w-4 h-4 text-brand-blue flex-none" />
                  {k}
                </dt>
                <dd className="font-medium text-brand-ink">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
            <div className="space-y-1 text-[13px] text-brand-muted">
              <p>
                Invitation reference{" "}
                <span className="font-mono text-brand-blue">{invitationReference || guestReference}</span>
              </p>
              <p>Admits: <span className="text-brand-ink font-medium">{admits}</span></p>
              <p>Please present this card with your VIP Security Pass on arrival.</p>
            </div>
            <QrBlock src={qrCodeDataUrl} loading={qrLoading} size={104} />
          </div>
        </div>
      </div>
    );
  }

  // 3. EMAIL DISPATCH PREVIEW — the real invitation template, exactly as sent
  return <EmailPreview data={data} />;
}

function EmailPreview({ data }: { data: TemplateData }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);

  const html = useMemo(
    () =>
      fillTemplate(
        INVITATION_HTML,
        buildInvitationVars(
          {
            title: data.guestTitle,
            fullName: data.fullName || "Honorable Dignitary",
            designation: data.designation,
            institution: data.company,
            rankColourHex: data.rankColourHex,
            rankName: data.rankName,
            rankOrder: data.rankName ? data.rankOrder : null,
          },
          {
            eventName: data.eventName || "2026 Festival of Nine Lessons and Carols",
            venueName: data.eventVenue,
            rsvpUrl: "#",
            reference: data.invitationReference || "GH-INV-PREVIEW",
          }
        ),
        { html: true }
      ),
    [data]
  );

  return (
    <div className="mx-auto w-full max-w-[680px] bg-white rounded-[14px] border border-[#E3E6EB] overflow-hidden">
      <div className="bg-[#F6F7F9] px-4 py-2.5 border-b border-[#E3E6EB] flex items-center justify-between gap-3 text-[#5B6374] text-[12px]">
        <span className="truncate">
          <b className="font-medium text-[#0D1526]">Subject:</b> {INVITATION_SUBJECT}
        </span>
        <span className="flex-none text-[11px] font-medium uppercase tracking-[0.12em] bg-[#EAF1FF] text-[#2563EB] px-2 py-0.5 rounded-[10px]">
          As sent
        </span>
      </div>
      <iframe
        ref={frameRef}
        title="Invitation email preview"
        srcDoc={html}
        sandbox="allow-same-origin"
        className="block w-full border-0"
        style={{ height }}
        onLoad={() => {
          const doc = frameRef.current?.contentDocument;
          if (doc) setHeight(doc.documentElement.scrollHeight);
        }}
      />
    </div>
  );
}
