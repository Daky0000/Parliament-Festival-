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
            });
          }
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
      <div className="min-h-screen bg-[#0A1830] flex flex-col items-center justify-center p-6 text-white text-center">
        <RefreshCw className="w-8 h-8 text-[#C6A65B] animate-spin mb-3" />
        <p className="font-editorial text-sm tracking-wider text-[#DFCA95]">
          Resolving Official Parliamentary Invitation...
        </p>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-[#0A1830] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="bg-[#102343] border border-rose-500/50 rounded-xl p-8 max-w-md w-full shadow-2xl space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="font-editorial text-xl font-bold text-white">
            Invitation Link Notice
          </h2>
          <p className="text-xs text-[#DFCA95]/80">
            {error || "This invitation link is unrecognized or has expired."}
          </p>
          <div className="pt-2 text-[11px] text-[#DFCA95]/60">
            Please contact Protocol Services: <strong>protocol@parliament.gh</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1830] text-[#F7F5F0] py-12 px-4 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full bg-[#102343] border-2 border-[#C6A65B] rounded-xl shadow-2xl overflow-hidden">
        {/* Formal Institutional Header */}
        <div className="p-8 text-center border-b border-[#C6A65B]/40 bg-[#0A1830]">
          <div className="w-14 h-14 rounded-full bg-[#102343] border-2 border-[#C6A65B] flex items-center justify-center font-editorial font-bold text-[#C6A65B] text-xl mx-auto mb-3 shadow-lg">
            GH
          </div>
          <h1 className="font-editorial text-xl font-bold tracking-widest text-[#C6A65B] uppercase">
            Parliament of Ghana
          </h1>
          <p className="text-[11px] text-[#DFCA95] tracking-widest uppercase mt-0.5">
            Office of the Rt. Hon. Speaker &bull; Protocol Directorate
          </p>
        </div>

        {/* Invitation Body */}
        <div className="p-8 space-y-6">
          {!confirmationData ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="text-center space-y-2">
                <p className="font-editorial text-sm italic text-[#DFCA95]">
                  The Rt. Hon. Speaker and Leadership of Parliament request the honour of the presence of
                </p>
                <h2 className="font-editorial text-2xl font-bold text-white">
                  {invitation.guestTitle} {invitation.guestFullName}
                </h2>
                <p className="text-xs text-[#C6A65B] font-semibold">
                  {invitation.designation} &bull; {invitation.institution}
                </p>
                <div className="pt-2">
                  <span className="text-[10px] bg-[#0A1830] text-[#DFCA95] border border-[#C6A65B]/40 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-bold">
                    {invitation.protocolCategory}
                  </span>
                </div>
              </div>

              {/* Event Schedule Box */}
              <div className="bg-[#0A1830] border border-[#C6A65B]/30 rounded-lg p-5 text-center space-y-3">
                <p className="text-xs uppercase tracking-widest text-[#DFCA95] font-bold">
                  at the official
                </p>
                <h3 className="font-editorial text-xl font-bold text-white">
                  {invitation.eventName}
                </h3>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#DFCA95] pt-1">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#C6A65B]" />
                    Friday, 18th December 2026
                  </span>
                  <span>&bull;</span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#C6A65B]" />
                    4:00 PM GMT
                  </span>
                </div>
                <div className="text-xs text-[#DFCA95]/80 flex items-center justify-center gap-1.5 pt-1">
                  <MapPin className="w-4 h-4 text-[#C6A65B]" />
                  {invitation.eventVenue}, {invitation.eventAddress}
                </div>
              </div>

              {/* Response Selector */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#DFCA95] uppercase tracking-wider block text-center">
                  Your Formal Response
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedResponse("accepted")}
                    className={`py-3 px-4 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      selectedResponse === "accepted"
                        ? "bg-[#C6A65B] text-[#0A1830] border-[#C6A65B] shadow-md"
                        : "bg-[#0A1830] text-white border-[#C6A65B]/30 hover:border-[#C6A65B]"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Accept with Honour
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedResponse("declined")}
                    className={`py-3 px-4 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      selectedResponse === "declined"
                        ? "bg-rose-900 text-white border-rose-500 shadow-md"
                        : "bg-[#0A1830] text-white border-[#C6A65B]/30 hover:border-[#C6A65B]"
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    Regretfully Decline
                  </button>
                </div>
              </div>

              {/* Accompanying Persons Selector */}
              {selectedResponse === "accepted" && invitation.companionAllowance > 0 && (
                <div className="bg-[#0A1830] border border-[#C6A65B]/30 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-[#DFCA95]">Accompanying Persons (Spouse / Aide)</span>
                    <span className="text-[11px] text-[#DFCA95]/70">
                      Allowance: Max {invitation.companionAllowance}
                    </span>
                  </div>
                  <select
                    value={companionCount}
                    onChange={(e) => setCompanionCount(parseInt(e.target.value) || 0)}
                    className="w-full bg-[#102343] border border-[#C6A65B]/40 rounded p-2 text-xs text-white focus:outline-none focus:border-[#C6A65B]"
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
                  className="w-full bg-[#C6A65B] hover:bg-[#DFCA95] text-[#0A1830] font-bold py-3 px-6 rounded-lg text-sm shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  Submit Official Response
                </button>
                <p className="text-center text-[10px] text-[#DFCA95]/60 mt-2">
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
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#C6A65B]">
                  Official Confirmation Recorded
                </span>
                <h2 className="font-editorial text-2xl font-bold text-white mt-1">
                  {confirmationData.response === "accepted"
                    ? "Attendance Confirmed with Honour"
                    : "Regrets Received with Thanks"}
                </h2>
                <p className="text-xs text-[#DFCA95] mt-1 font-mono">
                  Confirmation Code: <strong>{confirmationData.confirmationReference}</strong>
                </p>
              </div>

              {confirmationData.response === "accepted" && (
                <div className="bg-[#0A1830] border border-[#C6A65B] rounded-xl p-6 max-w-sm mx-auto space-y-4 shadow-xl">
                  <div className="text-xs uppercase font-bold text-[#DFCA95] tracking-wider">
                    Official Event-Day Credential Pass
                  </div>

                  {confirmationData.qrCodeDataUrl ? (
                    <img
                      src={confirmationData.qrCodeDataUrl}
                      alt="Parliamentary Event Pass"
                      className="w-48 h-48 mx-auto rounded-lg border-2 border-[#C6A65B] p-2 bg-white"
                    />
                  ) : (
                    <div className="w-48 h-48 mx-auto rounded-lg border border-[#C6A65B] flex items-center justify-center text-xs text-[#DFCA95]">
                      Credential Hash Active
                    </div>
                  )}

                  <div className="text-xs text-[#DFCA95]/90 space-y-1">
                    <div className="font-bold text-white">
                      {invitation.guestTitle} {invitation.guestFullName}
                    </div>
                    <div>Allocated Section: <strong>{invitation.protocolCategory}</strong></div>
                    {confirmationData.companionCount > 0 && (
                      <div className="text-emerald-400 font-semibold">
                        Admit: Principal + {confirmationData.companionCount} Companion
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-[#DFCA95]/60 italic">
                    Please present this digital pass upon arrival at the Forecourt for usher verification.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Institutional Footer */}
        <div className="p-4 bg-[#0A1830] border-t border-[#C6A65B]/30 text-center text-[10px] text-[#DFCA95]/50 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-[#C6A65B]" />
          <span>Parliament of Ghana Event Operations Gateway &bull; Privacy Protected</span>
        </div>
      </div>
    </div>
  );
}

