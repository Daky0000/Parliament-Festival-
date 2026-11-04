"use client";

import React, { useMemo, useRef, useState } from "react";
import { INVITATION_HTML, INVITATION_SUBJECT } from "@/lib/email/invitation-template";
import { buildInvitationVars, fillTemplate } from "@/lib/email/render-invitation";
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
  eventName?: string;
  eventDate?: string;
  eventVenue?: string;
  qrCodeDataUrl?: string | null;
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
    rankColourHex = "#2563EB",
    seatReference = "SEC-A-R1-S01",
    sectionName = "Section A (Leadership)",
    invitationReference = "GH-INV-8821",
    eventName = "2026 Festival of Nine Lessons and Carols",
    eventDate = "Friday, 18th December 2026 • 4:00 PM GMT",
    eventVenue = "Forecourt of Parliament House, Osu, Accra",
    qrCodeDataUrl,
  } = data;

  const displayName = `${guestTitle ? guestTitle + " " : ""}${fullName || "Honorable Dignitary"}`;

  // 1. VIP SECURITY PASS & BADGE
  if (viewMode === "badge") {
    return (
      <div className="relative mx-auto w-full max-w-[390px] bg-[#0A1830] text-white rounded-2xl shadow-2xl border-2 border-[#C6A65B]/60 overflow-hidden font-sans print:border-black print:text-black print:shadow-none">
        {/* Lanyard punch slot */}
        <div className="bg-[#050D1A] py-2 flex justify-center border-b border-white/10">
          <div className="w-16 h-3 bg-white/20 rounded-full border border-white/30" />
        </div>

        {/* State Emblem Header */}
        <div className="px-6 pt-5 pb-3 text-center bg-gradient-to-b from-[#0A1830] to-[#0E2246] border-b border-[#C6A65B]/30 relative">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#102343] border border-[#C6A65B] mb-2 shadow-inner">
            <span className="font-editorial text-sm font-bold text-[#C6A65B] tracking-wider">GH</span>
          </div>
          <div className="font-editorial text-xs font-semibold uppercase tracking-[0.2em] text-[#C6A65B]">
            Parliament of Ghana
          </div>
          <div className="text-[10px] text-white/60 uppercase tracking-widest mt-0.5">
            Office of the Rt. Hon. Speaker &bull; Protocol Directorate
          </div>
          <div className="mt-2 text-[11px] font-medium text-white/90">
            {eventName}
          </div>
        </div>

        {/* Rank Banner */}
        <div
          className="py-1.5 px-4 text-center text-xs font-bold uppercase tracking-wider text-white shadow-sm flex items-center justify-center gap-2"
          style={{ backgroundColor: rankColourHex }}
        >
          <Award className="w-3.5 h-3.5" />
          <span>
            Rank {rankOrder}: {rankName}
          </span>
        </div>

        {/* Dignitary Body */}
        <div className="px-6 py-6 text-center space-y-4">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-[#C6A65B] font-semibold">
              Official Credential Pass
            </div>
            <h2 className="font-editorial text-xl font-bold tracking-tight text-white leading-tight">
              {displayName}
            </h2>
            {designation && (
              <p className="text-xs text-[#8FB2FF] font-medium leading-relaxed">
                {designation}
              </p>
            )}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-1 rounded-full bg-white/10 border border-white/15 text-[11px] text-white">
              <Building2 className="w-3 h-3 text-[#C6A65B]" />
              <span className="font-semibold">{company || "Invited Dignitary"}</span>
            </div>
          </div>

          {/* Seat Number & Reference Callout */}
          <div className="bg-[#102343]/90 border-2 border-[#C6A65B] rounded-xl p-3.5 text-center shadow-inner space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase font-bold tracking-[0.15em] text-[#C6A65B]">
              <Armchair className="w-3.5 h-3.5 text-[#C6A65B]" />
              Allocated Seat Reference
            </div>
            <div className="text-xl font-mono font-bold text-white tracking-wider">
              {seatReference || "SEC-A-RESERVED"}
            </div>
            <div className="text-[11px] text-[#8FB2FF] font-medium">
              {sectionName}
            </div>
          </div>

          {/* QR Code Verification */}
          <div className="bg-white rounded-xl p-3 inline-block shadow-md border-2 border-[#C6A65B]/40">
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="Security QR Code"
                className="w-32 h-32 mx-auto object-contain"
              />
            ) : (
              <div className="w-32 h-32 flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-300 rounded text-gray-700 p-2">
                <QrCode className="w-12 h-12 text-[#102343] mb-1" />
                <span className="text-[9px] font-mono text-center">SECURE QR ACTIVE</span>
              </div>
            )}
          </div>

          <div className="space-y-1 text-center">
            <div className="font-mono text-[11px] text-[#C6A65B] font-semibold tracking-wider">
              REF: {invitationReference}
            </div>
            <div className="text-[9px] text-white/50 italic">
              Present this credential upon arrival at the Forecourt for usher verification.
            </div>
          </div>
        </div>

        {/* Pass Footer */}
        <div className="bg-[#050D1A] px-4 py-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-white/60">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#C6A65B]" />
            Official Security Protocol
          </span>
          <span>Access: Principal + 1</span>
        </div>
      </div>
    );
  }

  // 2. FORMAL DIPLOMATIC INVITATION CARD
  if (viewMode === "card") {
    return (
      <div className="mx-auto w-full max-w-[620px] bg-[#FAF8F5] text-[#0A1830] rounded-2xl p-8 sm:p-12 shadow-2xl border-4 border-[#C6A65B] relative font-serif print:shadow-none print:border-black">
        {/* Subtle Watermark Frame */}
        <div className="border border-[#C6A65B]/40 p-6 sm:p-8 rounded-lg relative bg-white/70">
          {/* Header */}
          <div className="text-center space-y-2 border-b border-[#C6A65B]/40 pb-5">
            <div className="w-14 h-14 rounded-full bg-[#0A1830] text-[#C6A65B] flex items-center justify-center text-lg font-bold mx-auto shadow-md">
              GH
            </div>
            <h2 className="text-xs uppercase tracking-[0.25em] font-bold text-[#0A1830]">
              Parliament of Ghana
            </h2>
            <p className="text-[11px] tracking-widest uppercase text-[#5B6374]">
              Office of the Rt. Hon. Speaker &bull; Protocol Services
            </p>
          </div>

          {/* Invitation Text */}
          <div className="py-8 text-center space-y-5">
            <p className="text-sm italic text-[#5B6374]">
              The Rt. Hon. Speaker and Leadership of Parliament request the honour of the presence of
            </p>

            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#0A1830] tracking-tight">
                {displayName}
              </h1>
              {designation && (
                <p className="text-sm font-medium text-[#2563EB]">
                  {designation}
                </p>
              )}
              <div className="text-xs font-semibold text-[#5B6374] uppercase tracking-wider">
                {company}
              </div>
            </div>

            {/* Rank Callout */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: rankColourHex }}>
              <Award className="w-3.5 h-3.5" />
              <span>Rank {rankOrder}: {rankName}</span>
            </div>

            <p className="text-xs text-[#5B6374] uppercase tracking-widest pt-2">
              to the official commemoration of the
            </p>

            <h3 className="text-xl sm:text-2xl font-bold text-[#C6A65B] tracking-wide uppercase">
              {eventName}
            </h3>

            {/* Event Details Grid */}
            <div className="bg-[#FAF8F5] border border-[#C6A65B]/40 rounded-xl p-4 max-w-md mx-auto text-xs space-y-2">
              <div className="flex items-center justify-center gap-2 font-semibold text-[#0A1830]">
                <Calendar className="w-4 h-4 text-[#2563EB]" />
                <span>{eventDate}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-[#5B6374]">
                <MapPin className="w-4 h-4 text-[#2563EB]" />
                <span>{eventVenue}</span>
              </div>
            </div>

            {/* Official Seat Reference Badge */}
            <div className="bg-[#0A1830] text-white rounded-xl p-4 max-w-sm mx-auto shadow-md">
              <div className="text-[10px] uppercase font-bold tracking-widest text-[#C6A65B]">
                Reserved Seat Assignment
              </div>
              <div className="text-lg font-mono font-bold tracking-wider text-white mt-0.5">
                {seatReference}
              </div>
              <div className="text-xs text-[#8FB2FF] mt-0.5">
                {sectionName}
              </div>
            </div>
          </div>

          {/* Footer Card */}
          <div className="border-t border-[#C6A65B]/40 pt-4 flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#5B6374] gap-2">
            <span>Security Pass: <strong className="font-mono text-[#0A1830]">{invitationReference}</strong></span>
            <span>R.S.V.P: <strong>protocol@parliament.gh</strong></span>
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
