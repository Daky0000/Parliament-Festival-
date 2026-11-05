import { CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import type { GuestCard, ScanState } from "@/lib/checkin";

// High-contrast state banner + guest details. State is shown with colour,
// an icon and words, never colour alone.

const STYLE: Record<string, { bg: string; fg: string; label: string; Icon: typeof CheckCircle2 }> = {
  VALID: { bg: "#ECFDF3", fg: "#067647", label: "Valid — not yet checked in", Icon: CheckCircle2 },
  CHECKED_IN: { bg: "#067647", fg: "#FFFFFF", label: "Checked in", Icon: CheckCircle2 },
  ALREADY_CHECKED_IN: { bg: "#FFFAEB", fg: "#B54708", label: "Already checked in", Icon: Clock },
  RSVP_DECLINED: { bg: "#FFFAEB", fg: "#B54708", label: "Guest declined", Icon: AlertTriangle },
  EVENT_NOT_ACTIVE: { bg: "#F2F4F7", fg: "#344054", label: "Check-in not open", Icon: Clock },
  WRONG_GATE: { bg: "#FEF3F2", fg: "#B42318", label: "Not your gate", Icon: XCircle },
  UNAUTHORIZED: { bg: "#FEF3F2", fg: "#B42318", label: "Not authorized", Icon: XCircle },
  INVALID: { bg: "#FEF3F2", fg: "#B42318", label: "Invalid pass", Icon: XCircle },
  EXPIRED: { bg: "#FEF3F2", fg: "#B42318", label: "Expired pass", Icon: XCircle },
  REVOKED: { bg: "#FEF3F2", fg: "#B42318", label: "Revoked pass", Icon: XCircle },
};

export function ResultCard({
  state,
  message,
  guest,
  existing,
}: {
  state: ScanState | "CHECKED_IN";
  message: string;
  guest?: GuestCard;
  existing?: { checkedInAt: string | Date; gateName: string | null; byName: string | null } | null;
}) {
  const s = STYLE[state] ?? STYLE.INVALID;
  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite" className="rounded-[14px] p-4 flex items-start gap-3" style={{ background: s.bg, color: s.fg }}>
        <s.Icon className="w-7 h-7 flex-none" aria-hidden="true" />
        <div>
          <p className="text-[20px] font-semibold leading-tight">{s.label}</p>
          <p className="text-[14px] mt-1 opacity-90">{message}</p>
          {existing && (
            <p className="text-[13px] mt-1 opacity-90">
              First check-in {new Date(existing.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              {existing.gateName ? ` at ${existing.gateName}` : ""}
              {existing.byName ? ` by ${existing.byName}` : ""}.
            </p>
          )}
        </div>
      </div>
      {guest && (
        <div className="panel p-4 space-y-2">
          <p className="text-[13px] uppercase tracking-[0.12em] text-brand-muted">Welcome</p>
          <p className="text-[24px] font-medium leading-tight text-brand-ink">
            {guest.title && !guest.displayName.startsWith(guest.title) ? `${guest.title} ` : ""}
            {guest.displayName}
          </p>
          {(guest.designation || guest.institution) && (
            <p className="text-[15px] text-brand-muted">{[guest.designation, guest.institution].filter(Boolean).join(" · ")}</p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-[14px] pt-1">
            <div>
              <dt className="text-brand-muted text-[12px]">Category</dt>
              <dd className="font-medium text-brand-ink flex items-center gap-2">
                {guest.category?.colour && <span aria-hidden="true" className="w-3 h-3 rounded-full" style={{ background: guest.category.colour }} />}
                {guest.category?.name ?? "General guest"}
              </dd>
            </div>
            <div>
              <dt className="text-brand-muted text-[12px]">Seat</dt>
              <dd className="font-medium text-brand-ink">{guest.seat ?? "Open seating"}</dd>
            </div>
            <div>
              <dt className="text-brand-muted text-[12px]">Companions expected</dt>
              <dd className="font-medium text-brand-ink">{guest.companionsExpected}</dd>
            </div>
            <div>
              <dt className="text-brand-muted text-[12px]">Reference</dt>
              <dd className="font-medium text-brand-ink">{guest.reference}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
