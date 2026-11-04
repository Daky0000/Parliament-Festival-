"use client";

import { useState } from "react";
import { X, Printer, Copy, Check, Eye } from "lucide-react";
import { PassTemplate, TemplateData } from "./PassTemplate";

export function TemplatePreviewModal({
  isOpen,
  onClose,
  data,
}: {
  isOpen: boolean;
  onClose: () => void;
  data: TemplateData;
}) {
  const [viewMode, setViewMode] = useState<"badge" | "card" | "email">("badge");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const summary = `Dignitary: ${data.fullName}\nCompany: ${data.company}\nRank: Rank ${data.rankOrder} - ${data.rankName}\nSeat Ref: ${data.seatReference || "SEC-A-R1-S01"}\nEvent: ${data.eventName || "2026 Festival of Nine Lessons and Carols"}`;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-[#E3E6EB] space-y-4 my-8 max-h-[92vh] flex flex-col">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-[#E3E6EB] pb-3 flex-shrink-0">
          <div>
            <h3 className="font-editorial text-lg font-bold text-[#091833]">
              Official Dignitary Invitation & Pass Template
            </h3>
            <p className="text-xs text-[#5B6374]">
              Previewing personalized credential with Name, Company, Rank, and Seat Reference.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F6F7F9] hover:bg-[#E3E6EB] text-[#5B6374] flex items-center justify-center text-sm font-semibold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* View Switcher Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F6F7F9] p-2 rounded-lg flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode("badge")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === "badge"
                  ? "bg-[#2563EB] text-white shadow-sm"
                  : "bg-white text-[#5B6374] hover:text-[#091833] border border-[#E3E6EB]"
              }`}
            >
              VIP Security Pass
            </button>
            <button
              onClick={() => setViewMode("card")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === "card"
                  ? "bg-[#2563EB] text-white shadow-sm"
                  : "bg-white text-[#5B6374] hover:text-[#091833] border border-[#E3E6EB]"
              }`}
            >
              State Invitation Card
            </button>
            <button
              onClick={() => setViewMode("email")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === "email"
                  ? "bg-[#2563EB] text-white shadow-sm"
                  : "bg-white text-[#5B6374] hover:text-[#091833] border border-[#E3E6EB]"
              }`}
            >
              HTML Email Dispatch
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="px-2.5 py-1.5 bg-white border border-[#E3E6EB] hover:border-[#2563EB] rounded text-xs text-[#091833] font-semibold flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#5B6374]" />}
              <span>{copied ? "Copied!" : "Copy Details"}</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-2.5 py-1.5 bg-white border border-[#E3E6EB] hover:border-[#2563EB] rounded text-xs text-[#091833] font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 text-[#5B6374]" />
              <span>Print Pass</span>
            </button>
          </div>
        </div>

        {/* Template Render Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F0F2F5] rounded-xl flex items-center justify-center">
          <PassTemplate data={data} viewMode={viewMode} />
        </div>

        {/* Modal Footer */}
        <div className="border-t border-[#E3E6EB] pt-3 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#E3E6EB] rounded-md text-xs font-semibold text-[#5B6374] hover:bg-[#F6F7F9]"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}

