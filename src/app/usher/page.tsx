"use client";

import { useState } from "react";
import { QrCode, Search, ShieldCheck, CheckCircle2, AlertTriangle, Armchair, UserCheck, RefreshCw, X } from "lucide-react";

export default function UsherPage() {
  const [activeTab, setActiveTab] = useState<"scan" | "search">("scan");
  const [credentialHashInput, setCredentialHashInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [checkinResult, setCheckinResult] = useState<any | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Supervisor Override State
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const handleValidateCredential = async (credHash: string, isOverride = false) => {
    setIsLoading(true);
    setDuplicateWarning(null);
    setCheckinResult(null);

    try {
      // Fetch active event ID
      const eventsRes = await fetch("/api/v1/events");
      const eventsData = await eventsRes.json();
      const eventId = eventsData.data[0]?.id;

      const res = await fetch("/api/v1/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          credentialHash: credHash,
          checkinMethod: isOverride ? "supervisor_override" : "qr",
          isSupervisorOverride: isOverride,
          overrideReason: isOverride ? overrideReason : undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 409 && data.status === "DUPLICATE_CHECKIN_WARNING") {
        setDuplicateWarning(data);
      } else if (data.data?.status === "CHECKED_IN") {
        setCheckinResult(data.data);
        setIsOverrideModalOpen(false);
      } else {
        alert(data.error || "Failed to validate credential.");
      }
    } catch (err) {
      console.error("Check-in error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const eventsRes = await fetch("/api/v1/events");
      const eventsData = await eventsRes.json();
      const eventId = eventsData.data[0]?.id;

      const res = await fetch("/api/v1/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          manualQuery: searchQuery,
        }),
      });

      const data = await res.json();
      if (data.data?.type === "search_results") {
        setSearchResults(data.data.results);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualGuestCheckin = async (guestId: string) => {
    setIsLoading(true);
    setDuplicateWarning(null);
    setCheckinResult(null);

    try {
      const eventsRes = await fetch("/api/v1/events");
      const eventsData = await eventsRes.json();
      const eventId = eventsData.data[0]?.id;

      const res = await fetch("/api/v1/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          eventGuestId: guestId,
          checkinMethod: "manual",
        }),
      });

      const data = await res.json();
      if (res.status === 409 && data.status === "DUPLICATE_CHECKIN_WARNING") {
        setDuplicateWarning(data);
      } else if (data.data?.status === "CHECKED_IN") {
        setCheckinResult(data.data);
      } else {
        alert(data.error || "Check-in failed.");
      }
    } catch (err) {
      console.error("Manual checkin error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1830] text-[#F7F5F0] flex flex-col max-w-md mx-auto p-4 select-none">
      {/* Mobile Usher Header */}
      <div className="border-b border-[#C6A65B]/30 pb-4 mb-4 text-center">
        <div className="w-10 h-10 rounded-full bg-[#102343] border border-[#C6A65B] flex items-center justify-center font-editorial font-bold text-[#C6A65B] text-lg mx-auto mb-2 shadow-md">
          GH
        </div>
        <h1 className="font-editorial text-base font-bold tracking-wider text-[#FFFFFF] uppercase">
          Forecourt Usher Portal
        </h1>
        <p className="text-[11px] text-[#DFCA95] tracking-widest uppercase">
          2026 Festival of Nine Lessons and Carols
        </p>
      </div>

      {/* Tabs Switcher */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setActiveTab("scan")}
          className={`py-2 text-xs font-bold rounded-md flex items-center justify-center gap-2 transition-all ${
            activeTab === "scan"
              ? "bg-[#C6A65B] text-[#0A1830] shadow"
              : "bg-[#102343] text-[#DFCA95] border border-[#C6A65B]/30"
          }`}
        >
          <QrCode className="w-4 h-4" />
          QR Scan Mode
        </button>
        <button
          onClick={() => setActiveTab("search")}
          className={`py-2 text-xs font-bold rounded-md flex items-center justify-center gap-2 transition-all ${
            activeTab === "search"
              ? "bg-[#C6A65B] text-[#0A1830] shadow"
              : "bg-[#102343] text-[#DFCA95] border border-[#C6A65B]/30"
          }`}
        >
          <Search className="w-4 h-4" />
          Manual Lookup
        </button>
      </div>

      {/* Active Tab: Scan Mode */}
      {activeTab === "scan" && (
        <div className="space-y-4">
          <div className="bg-[#102343] border-2 border-dashed border-[#C6A65B]/60 rounded-xl p-6 text-center space-y-3">
            <QrCode className="w-16 h-16 text-[#C6A65B] mx-auto animate-pulse" />
            <h3 className="font-bold text-sm text-white">Scanner Active</h3>
            <p className="text-[11px] text-[#DFCA95]/80">
              Hold camera over attendee's printed or mobile QR credential pass.
            </p>

            <div className="pt-2">
              <input
                type="text"
                placeholder="Or paste credential hash to test..."
                value={credentialHashInput}
                onChange={(e) => setCredentialHashInput(e.target.value)}
                className="w-full bg-[#0A1830] border border-[#C6A65B]/40 rounded p-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-[#C6A65B]"
              />
              <button
                onClick={() => handleValidateCredential(credentialHashInput)}
                disabled={isLoading || !credentialHashInput.trim()}
                className="w-full mt-2 bg-[#C6A65B] text-[#0A1830] font-bold py-2 rounded text-xs hover:bg-[#DFCA95] transition-colors disabled:opacity-50"
              >
                {isLoading ? "Validating..." : "Verify Credential Pass"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Tab: Manual Search Mode */}
      {activeTab === "search" && (
        <div className="space-y-4">
          <form onSubmit={handleManualSearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Search dignitary name or GH-GST reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-[#102343] border border-[#C6A65B]/40 rounded p-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-[#C6A65B]"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="bg-[#C6A65B] text-[#0A1830] font-bold px-4 py-2 rounded text-xs"
            >
              Search
            </button>
          </form>

          {/* Search Results List */}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {searchResults.map((result) => (
              <div
                key={result.guestId}
                className="bg-[#102343] border border-[#C6A65B]/30 rounded-lg p-3 text-xs flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-white">
                    {result.title} {result.fullName}
                  </div>
                  <div className="text-[11px] text-[#DFCA95]/80">
                    {result.categoryName} &bull; {result.seatLabel}
                  </div>
                </div>
                <button
                  onClick={() => handleManualGuestCheckin(result.guestId)}
                  className="bg-[#C6A65B] text-[#0A1830] font-bold px-3 py-1.5 rounded text-xs flex-shrink-0"
                >
                  Check In
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Successful Check-In Card (Minimal PII for Usher) */}
      {checkinResult && (
        <div className="mt-4 bg-white text-[#202A38] rounded-xl p-5 border-2 border-emerald-500 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between pb-2 border-b border-[#E4E7EC]">
            <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Verified & Checked In
            </div>
            <span className="text-[10px] text-[#667085] font-mono">
              {new Date(checkinResult.checkedInAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="font-editorial text-lg font-bold text-[#102343]">
              {checkinResult.guest.title} {checkinResult.guest.fullName}
            </h2>
            <p className="text-xs text-[#667085]">{checkinResult.guest.designation}</p>
          </div>

          {/* Seating Instruction Box (Primary Usher View) */}
          <div
            className="p-4 rounded-lg text-white space-y-1 shadow-md text-center"
            style={{ backgroundColor: checkinResult.guest.sectionColor || "#102343" }}
          >
            <div className="text-[10px] uppercase font-bold tracking-widest text-[#DFCA95]">
              Direct Dignitary To
            </div>
            <div className="text-xl font-bold font-editorial">
              {checkinResult.guest.sectionName}
            </div>
            <div className="text-sm font-semibold text-[#DFCA95]">
              {checkinResult.guest.seatCode}
            </div>
          </div>

          {/* Companion Headcount */}
          {checkinResult.guest.companionCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded p-2.5 text-center text-xs font-semibold">
              Permitted Companion Headcount:{" "}
              <strong>+{checkinResult.guest.companionCount} Persons</strong>
            </div>
          )}

          <button
            onClick={() => {
              setCheckinResult(null);
              setCredentialHashInput("");
            }}
            className="w-full bg-[#102343] text-[#DFCA95] font-bold py-2 rounded text-xs hover:bg-[#0A1830]"
          >
            Ready for Next Attendee
          </button>
        </div>
      )}

      {/* Duplicate Scan Warning Alert */}
      {duplicateWarning && (
        <div className="mt-4 bg-rose-50 border-2 border-rose-500 rounded-xl p-5 text-rose-950 space-y-3 shadow-xl">
          <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            Duplicate Check-In Warning!
          </div>
          <p className="text-xs">
            Dignitary <strong>{duplicateWarning.details?.guestName}</strong> was already checked in at{" "}
            <strong>
              {new Date(duplicateWarning.details?.checkedInAt).toLocaleTimeString()}
            </strong>{" "}
            by <em>{duplicateWarning.details?.checkedInBy}</em>.
          </p>

          <div className="pt-2 flex gap-2">
            <button
              onClick={() => setDuplicateWarning(null)}
              className="flex-1 py-1.5 border border-rose-300 rounded text-xs font-semibold hover:bg-rose-100"
            >
              Dismiss
            </button>
            <button
              onClick={() => setIsOverrideModalOpen(true)}
              className="flex-1 py-1.5 bg-rose-700 text-white rounded text-xs font-bold hover:bg-rose-800"
            >
              Supervisor Override
            </button>
          </div>
        </div>
      )}

      {/* Supervisor Override Modal */}
      {isOverrideModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white text-[#202A38] rounded-lg p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-[#102343]">
                Supervisor Check-In Override
              </h3>
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#667085]">
              Overrides are recorded in the security audit trail. A documented operational reason is mandatory.
            </p>
            <div>
              <label className="text-xs font-semibold block mb-1">
                Mandatory Override Reason *
              </label>
              <textarea
                required
                rows={3}
                placeholder="e.g. VIP arrived with official motorcade; prior scan was test verification."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded p-2 focus:outline-none focus:border-[#C6A65B]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="px-3 py-1.5 border rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleValidateCredential(credentialHashInput, true)}
                disabled={!overrideReason.trim()}
                className="px-4 py-1.5 bg-[#102343] text-[#DFCA95] font-bold rounded text-xs disabled:opacity-50"
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Security Footer */}
      <div className="mt-auto pt-6 text-center text-[10px] text-[#DFCA95]/40 flex items-center justify-center gap-1">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        <span>Parliamentary Protocol Operations &bull; Least-Privilege Enforced</span>
      </div>
    </div>
  );
}

