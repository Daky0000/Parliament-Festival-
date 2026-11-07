import { DAKYX_NAME, DAKYX_PHONE, DAKYX_PHONE_TEL, DAKYX_URL } from "@/lib/brand/dakyx";

/** "Powered by DakyXTech" with the DX mark, linking to dakyx.com. */
export function PoweredBy({ className = "", showPhone = false }: { className?: string; showPhone?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 text-[11.5px] text-brand-muted ${className}`}>
      <a
        href={DAKYX_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 no-underline hover:text-brand-ink"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/brand/dakyx-mark.png" alt="" width={14} height={14} className="w-3.5 h-3.5" />
        <span>
          Powered by <span className="font-medium text-brand-blue">{DAKYX_NAME}</span>
        </span>
      </a>
      {showPhone && (
        <a href={`tel:${DAKYX_PHONE_TEL}`} className="text-brand-muted hover:text-brand-ink no-underline">
          {DAKYX_PHONE}
        </a>
      )}
    </div>
  );
}
