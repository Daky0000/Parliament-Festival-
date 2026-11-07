"use client";

import { useEffect, useState } from "react";
import { X, Printer, Copy, Check, Download, ShieldCheck, ScrollText, Mail } from "lucide-react";
import { PassTemplate, TemplateData } from "./PassTemplate";

type ViewMode = "badge" | "card" | "email";

const TABS: Array<{ id: ViewMode; label: string; icon: typeof ShieldCheck }> = [
  { id: "badge", label: "VIP Security Pass", icon: ShieldCheck },
  { id: "card", label: "State Invitation Card", icon: ScrollText },
  { id: "email", label: "Invitation Email", icon: Mail },
];

/**
 * Pass & invitation preview. When `guestId` is given, the guest's real QR
 * pass is loaded from the passes API (staff-only, audited) and shown on both
 * credentials; otherwise a placeholder is shown.
 */
export function TemplatePreviewModal({
  isOpen,
  onClose,
  data,
  guestId,
}: {
  isOpen: boolean;
  onClose: () => void;
  data: TemplateData;
  guestId?: string;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("badge");
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<{ guestId: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!isOpen || !guestId) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(`/api/v1/passes/${guestId}`)
      .then(async (r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = blob ? URL.createObjectURL(blob) : null;
        setQr({ guestId, url: objectUrl });
      })
      .catch(() => !cancelled && setQr({ guestId, url: null }));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, guestId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("print-pass");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("print-pass");
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const qrForGuest = guestId && qr?.guestId === guestId ? qr : null;
  const passData: TemplateData = {
    ...data,
    qrCodeDataUrl: data.qrCodeDataUrl ?? qrForGuest?.url ?? null,
    qrLoading: !!guestId && !qrForGuest,
  };

  const handleCopySummary = () => {
    const summary = [
      `Dignitary: ${data.fullName}`,
      data.designation ? `Designation: ${data.designation}` : null,
      `Institution: ${data.company}`,
      `Rank: ${data.rankName ? `Rank ${data.rankOrder} · ${data.rankName}` : "Invited guest"}`,
      `Seat: ${[data.sectionName, data.seatReference].filter(Boolean).join(" · ") || "To be assigned"}`,
      `Reference: ${data.invitationReference || data.guestReference || "—"}`,
      `Event: ${data.eventName || "2026 Festival of Nine Lessons and Carols"}`,
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="pass-modal fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-[60] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Pass and invitation preview"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-brand-canvas rounded-[22px] max-w-[720px] w-full p-2 shadow-float my-6 max-h-[94vh] flex flex-col">
        <div className="no-print bg-white rounded-[14px] px-4 sm:px-5 py-4 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <span className="cap">Credentials</span>
            <h3 className="mt-1 text-[19px] font-normal tracking-[-0.02em] text-brand-ink truncate">
              {[data.guestTitle, data.fullName].filter(Boolean).join(" ")}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="w-9 h-9 flex-none rounded-[10px] bg-brand-soft hover:bg-brand-line text-brand-muted grid place-items-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="no-print mt-2 bg-white rounded-[14px] p-2 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          <div className="flex flex-wrap gap-1" role="tablist">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={viewMode === id}
                onClick={() => setViewMode(id)}
                className={`px-3 py-2 rounded-[10px] text-[12.5px] font-medium flex items-center gap-1.5 transition-colors ${
                  viewMode === id ? "bg-brand-navy text-white" : "text-brand-muted hover:bg-brand-soft hover:text-brand-ink"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${viewMode === id ? "text-brand-blueLight" : ""}`} />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopySummary}
              className="px-3 py-2 rounded-[10px] border border-brand-line hover:border-brand-blue text-[12.5px] text-brand-ink font-medium flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-brand-positive" /> : <Copy className="w-3.5 h-3.5 text-brand-muted" />}
              {copied ? "Copied" : "Copy details"}
            </button>
            {guestId && qrForGuest?.url && (
              <a
                href={`/api/v1/passes/${guestId}`}
                className="px-3 py-2 rounded-[10px] border border-brand-line hover:border-brand-blue text-[12.5px] text-brand-ink font-medium flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-brand-muted" />
                QR
              </a>
            )}
            {viewMode !== "email" && (
              <button
                onClick={() => window.print()}
                className="px-3 py-2 rounded-[10px] bg-brand-blue hover:bg-brand-blueDark text-white text-[12.5px] font-medium flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex-1 overflow-y-auto rounded-[14px] p-3 sm:p-6 bg-brand-line/60 print:bg-white print:p-0">
          <PassTemplate data={passData} viewMode={viewMode} />
        </div>
      </div>
    </div>
  );
}
