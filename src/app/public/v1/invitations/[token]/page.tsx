"use client";

import { useEffect, useState, use } from "react";
import { CheckCircle2, XCircle, Calendar, MapPin, Clock, ShieldCheck, Download, AlertCircle, RefreshCw } from "lucide-react";

export default function PublicRsvpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [invitation, setInvitation] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [selectedResponse, setSelectedResponse] = useState<"accepted" | "declined">("accepted");
  const [companionCount, setCompanionCount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationData, setConfirmationData] = useState<any | null>(null);

  useEffect(() => {
    async function loadInvitation() {
      try {
        const res = await fetch(`/api/v1/public/invitations/${token}`);
        const json = await res.json();
        if (res.ok && json.data) {
          setInvitation(json.data);
          if (json.data.currentRsvp) {
            setConfirmationData({
              confirmationReference: json.data.currentRsvp.confirmationReference,
              response: json.data.currentRsvp.response,
              companionCount: json.data.currentRsvp.companionCount,
              qrCodeDataUrl: json.data.qrCodeDataUrl,
            });
          }
          // Count the view only from a real browser running this page.
          fetch(`/api/v1/public/invitations/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "view" }),
          }).catch(() => {});
        } else {
          setError(json.error || "Invalid or expired invitation link.");
        }
      } catch (err: any) {
        setError("Unable to connect to the Parliamentary RSVP gateway.");
      } finally {
        setIsLoading(false);
      }
    }
    loadInvitation();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/public/invitations/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rsvp",
          response: selectedResponse,
          companionCount: selectedResponse === "accepted" ? companionCount : 0,
          notes,
        }),
      });

      const json = await res.json();
      if (res.ok && json.data) {
        setConfirmationData(json.data);
      } else {
        setError(json.error || "Failed to submit response.");
      }
    } catch (err) {
      setError("Network error while submitting response. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#091833] flex flex-col items-center justify-center p-6 text-white text-center">
        <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin mb-3" />
        <p className="font-editorial text-sm tracking-wider text-[#8FB2FF]">
          Resolving Official Parliamentary Invitation...
        </p>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-[#091833] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="bg-[#091833] border-rose-500/50 rounded-2xl p-8 max-w-md w-full shadow-float space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="font-editorial text-xl font-medium text-white">
            Invitation Link Notice
          </h2>
          <p className="text-xs text-white/70">
            {error || "This invitation link is unrecognized or has expired."}
          </p>
          <div className="pt-2 text-[11px] text-white/55">
            Please contact Protocol Services: <strong>protocol@parliament.gh</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#091833] text-[#F6F7F9] py-12 px-4 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full bg-[#091833] rounded-2xl shadow-float overflow-hidden">
        {/* Formal Institutional Header */}
        <div className="p-8 text-center border-b bg-[#091833]">
          <div className="w-14 h-14 rounded-full bg-[#091833] flex items-center justify-center font-editorial font-medium text-[#2563EB] text-xl mx-auto mb-3 shadow-float">
            GH
          </div>
          <h1 className="font-editorial text-xl font-medium tracking-widest text-[#2563EB] uppercase">
            Parliament of Ghana
          </h1>
          <p className="text-[11px] text-[#8FB2FF] tracking-widest uppercase mt-0.5">
            Office of the Rt. Hon. Speaker &bull; Protocol Directorate
          </p>
        </div>

        {/* Invitation Body */}
        <div className="p-8 space-y-6">
          {!confirmationData ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="text-center space-y-2">
                <p className="font-editorial text-sm italic text-[#8FB2FF]">
                  The Rt. Hon. Speaker and Leadership of Parliament request the honour of the presence of
                </p>
                <h2 className="font-editorial text-2xl font-medium text-white">
                  {invitation.guestTitle} {invitation.guestFullName}
                </h2>
                <p className="text-xs text-[#2563EB] font-semibold">
                  {invitation.designation} &bull; {invitation.institution}
                </p>
                <div className="pt-2">
                  <span className="text-[10px] bg-[#091833] text-[#8FB2FF] px-2.5 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                    {invitation.protocolCategory}
                  </span>
                </div>
              </div>

              {/* Event Schedule Box */}
              <div className="bg-[#091833] rounded-2xl p-5 text-center space-y-3">
                <p className="text-xs uppercase tracking-widest text-[#8FB2FF] font-semibold">
                  at the official
                </p>
                <h3 className="font-editorial text-xl font-medium text-white">
                  {invitation.eventName}
                </h3>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#8FB2FF] pt-1">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#2563EB]" />
                    Friday, 18th December 2026
                  </span>
                  <span>&bull;</span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#2563EB]" />
                    4:00 PM GMT
                  </span>
                </div>
                <div className="text-xs text-white/70 flex items-center justify-center gap-1.5 pt-1">
                  <MapPin className="w-4 h-4 text-[#2563EB]" />
                  {invitation.eventVenue}, {invitation.eventAddress}
                </div>
              </div>

              {/* Response Selector */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-[#8FB2FF] uppercase tracking-wider block text-center">
                  Your Formal Response
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedResponse("accepted")}
                    className={`py-3 px-4 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                      selectedResponse === "accepted"
                        ? "bg-[#2563EB] text-[#091833] border-[#2563EB] shadow-md"
                        : "bg-[#091833] text-white border-[#2563EB]/30 hover:border-[#2563EB]"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Accept with Honour
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedResponse("declined")}
                    className={`py-3 px-4 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                      selectedResponse === "declined"
                        ? "bg-rose-900 text-white border-rose-500 shadow-md"
                        : "bg-[#091833] text-white border-[#2563EB]/30 hover:border-[#2563EB]"
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    Regretfully Decline
                  </button>
                </div>
              </div>

              {/* Accompanying Persons Selector */}
              {selectedResponse === "accepted" && invitation.companionAllowance > 0 && (
                <div className="bg-[#091833] rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-[#8FB2FF]">Accompanying Persons (Spouse / Aide)</span>
                    <span className="text-[11px] text-white/60">
                      Allowance: Max {invitation.companionAllowance}
                    </span>
                  </div>
                  <select
                    value={companionCount}
                    onChange={(e) => setCompanionCount(parseInt(e.target.value) || 0)}
                    className="w-full bg-[#091833] rounded p-2 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value={0}>Attending Alone (0 Companions)</option>
                    {Array.from({ length: invitation.companionAllowance }, (_, i) => i + 1).map(
                      (num) => (
                        <option key={num} value={num}>
                          Attending with +{num} Person{num > 1 ? "s" : ""}
                        </option>
                      )
                    )}
                  </select>
                </div>
              )}

              {/* Submit CTA */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold py-3 px-6 rounded-lg text-sm shadow-float transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  Submit Official Response
                </button>
                <p className="text-center text-[10px] text-white/55 mt-2">
                  Ref: {invitation.invitationReference} &bull; Official Parliamentary Security Protocol
                </p>
              </div>
            </form>
          ) : (
            /* Confirmation Screen with Instant QR Pass */
            <div className="text-center space-y-6">
              <div className="w-14 h-14 bg-emerald-900/60 border border-emerald-500 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="text-[10px] uppercase font-semibold tracking-widest text-[#2563EB]">
                  Official Confirmation Recorded
                </span>
                <h2 className="font-editorial text-2xl font-medium text-white mt-1">
                  {confirmationData.response === "accepted"
                    ? "Attendance Confirmed with Honour"
                    : "Regrets Received with Thanks"}
                </h2>
                <p className="text-xs text-[#8FB2FF] mt-1 font-mono">
                  Confirmation Code: <strong>{confirmationData.confirmationReference}</strong>
                </p>
              </div>

              {confirmationData.response === "accepted" && (
                <div className="bg-[#091833] rounded-2xl p-6 max-w-sm mx-auto space-y-4 shadow-float">
                  <div className="text-xs uppercase font-semibold text-[#8FB2FF] tracking-wider">
                    Official Event-Day Credential Pass
                  </div>

                  {confirmationData.qrCodeDataUrl ? (
                    <img
                      src={confirmationData.qrCodeDataUrl}
                      alt="Parliamentary Event Pass"
                      className="w-48 h-48 mx-auto rounded-lg border-2 border-[#2563EB] p-2 bg-white"
                    />
                  ) : (
                    <div className="w-48 h-48 mx-auto rounded-lg border border-[#2563EB] flex items-center justify-center text-xs text-[#8FB2FF]">
                      Your pass will appear here once your attendance is confirmed.
                    </div>
                  )}

                  <div className="text-xs text-white/75 space-y-1">
                    <div className="font-semibold text-white">
                      {invitation.guestTitle} {invitation.guestFullName}
                    </div>
                    <div>Allocated Section: <strong>{invitation.protocolCategory}</strong></div>
                    {confirmationData.companionCount > 0 && (
                      <div className="text-emerald-400 font-semibold">
                        Admit: Principal + {confirmationData.companionCount} Companion
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-white/55 italic">
                    Please present this digital pass upon arrival at the Forecourt for usher verification.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Institutional Footer */}
        <div className="p-4 bg-[#091833] border-t text-center text-[10px] text-white/55 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-[#2563EB]" />
          <span>Parliament of Ghana Event Operations Gateway &bull; Privacy Protected</span>
        </div>
      </div>
    </div>
  );
}

