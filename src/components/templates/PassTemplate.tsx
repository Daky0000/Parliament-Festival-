"use client";

import React from "react";
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

  // 3. RESPONSIVE EMAIL DISPATCH PREVIEW
  return (
    <div className="mx-auto w-full max-w-[580px] bg-white rounded-xl shadow-lg border border-[#E3E6EB] overflow-hidden font-sans text-xs">
      {/* Email Client Top Bar */}
      <div className="bg-[#F6F7F9] px-4 py-2.5 border-b border-[#E3E6EB] flex items-center justify-between text-[#5B6374] text-[11px]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 font-mono text-[10px]">Subject: Official State Invitation: {eventName}</span>
        </div>
        <span className="text-[10px] bg-[#E3E6EB] px-2 py-0.5 rounded font-mono">HTML Preview</span>
      </div>

      {/* Rendered Email Content */}
      <div className="p-6 sm:p-8 space-y-6 bg-[#FAF8F5]">
        <div className="bg-[#0A1830] text-white p-6 rounded-t-xl text-center border-b-2 border-[#C6A65B]">
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-[#C6A65B]">
            PARLIAMENT OF GHANA
          </div>
          <div className="text-[10px] text-white/60 tracking-wider uppercase mt-1">
            Office of the Rt. Hon. Speaker &bull; Protocol Directorate
          </div>
        </div>

        <div className="bg-white p-6 rounded-b-xl border border-[#E3E6EB] shadow-sm space-y-4">
          <p className="text-xs text-[#5B6374]">
            Dear <strong className="text-[#091833]">{displayName}</strong>,
          </p>

          <p className="text-xs leading-relaxed text-[#091833]">
            The Rt. Hon. Speaker and the Leadership of Parliament request the honour of your presence at the official commemoration of the <strong>{eventName}</strong>.
          </p>

          {/* Dignitary & Seating Snapshot Table */}
          <div className="bg-[#F6F7F9] rounded-lg p-4 border border-[#E3E6EB] space-y-2">
            <div className="flex justify-between items-center pb-2 border-b border-[#E3E6EB]">
              <span className="text-[#5B6374]">Invited Dignitary:</span>
              <span className="font-semibold text-[#091833]">{displayName}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-[#E3E6EB]">
              <span className="text-[#5B6374]">Institution / Company:</span>
              <span className="font-semibold text-[#091833]">{company}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-[#E3E6EB]">
              <span className="text-[#5B6374]">Protocol Rank:</span>
              <span className="inline-flex items-center gap-1 font-semibold text-white px-2 py-0.5 rounded text-[10px]" style={{ backgroundColor: rankColourHex }}>
                Rank {rankOrder}: {rankName}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#5B6374]">Reserved Seat Reference:</span>
              <span className="font-mono font-bold text-[#2563EB] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {seatReference} ({sectionName})
              </span>
            </div>
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded text-xs text-[#1E3A8A] space-y-1">
            <div><strong>Date & Time:</strong> {eventDate}</div>
            <div><strong>Venue:</strong> {eventVenue}</div>
          </div>

          <div className="pt-2 text-center">
            <button className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold py-2.5 px-6 rounded-md shadow transition-colors inline-flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Confirm Attendance / Formal RSVP
            </button>
            <div className="text-[10px] text-[#5B6374] mt-2">
              Unique Pass Ref: <span className="font-mono">{invitationReference}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

