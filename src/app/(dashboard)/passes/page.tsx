import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { prisma } from "@/lib/db";
import { can } from "@/lib/authz";
import { activePassToken, scanUrl } from "@/lib/guest-tokens";
import { passQrSvg, svgDataUrl } from "@/lib/pass-qr";
import { PassesToolbar } from "./PassesToolbar";

export const dynamic = "force-dynamic";

// Printable QR passes for every seated dignitary. A pass admits its holder,
// so the page is limited to staff who manage guests.
export default async function PassesPage() {
  const guard = await guardPage("guests.update", "/passes");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;
  const { actor, event } = guard;

  const seated = await prisma.seatAssignment.findMany({
    where: { seatingPlan: { eventId: event.id }, status: { in: ["proposed", "approved"] } },
    include: { section: true, seat: true, eventGuest: { include: { person: true, protocolCategory: true, institution: true } } },
    orderBy: [{ section: { displayOrder: "asc" } }, { seat: { seatCode: "asc" } }],
  });

  const cards = await Promise.all(
    seated.map(async (a) => {
      const token = await activePassToken(prisma, a.eventGuestId);
      const g = a.eventGuest;
      return {
        id: a.id,
        guestId: g.id,
        name: [g.person.title && !g.person.fullName.startsWith(g.person.title) ? g.person.title : null, g.person.fullName].filter(Boolean).join(" "),
        designation: [g.person.designation, g.institution?.name].filter(Boolean).join(" · "),
        category: g.protocolCategory?.name ?? "Invited guest",
        colour: g.protocolCategory?.colourHex ?? "#091833",
        seat: `${a.section.name}${a.seat ? ` · Seat ${a.seat.seatCode}` : ""}`,
        reference: g.guestReference,
        qr: token ? svgDataUrl(passQrSvg(scanUrl(token), { title: `Event pass for ${g.person.fullName}` })) : null,
      };
    })
  );
  const missing = cards.filter((c) => !c.qr).length;

  return (
    <div className="space-y-[var(--frame)]">
      <section className="panel p-6 sm:p-8 space-y-3 no-print">
        <h2 className="text-[22px] font-medium text-brand-ink">Guest passes</h2>
        <p className="text-[14px] text-brand-muted">
          Every seated dignitary gets a QR pass automatically when a seat is assigned. Ushers scan it at the gate.
          {missing > 0 && ` ${missing} seated guest(s) have no pass yet (for example, seated before passes were automatic, or declined).`}
        </p>
        <PassesToolbar eventId={event.id} canGenerate={can(actor, "seating.assign", event.id)} missing={missing} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 passes-grid">
        {cards.map((c) => (
          <article key={c.id} className="panel overflow-hidden pass-card">
            <div className="h-2" style={{ background: c.colour }} aria-hidden="true" />
            <div className="p-5 flex gap-4 items-center">
              {c.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.qr} alt={`QR pass for ${c.name}`} width={132} height={132} className="w-[132px] h-[132px] flex-none" />
              ) : (
                <div className="w-[132px] h-[132px] flex-none grid place-items-center text-center text-[12px] text-brand-muted border border-dashed border-brand-line2 rounded-[10px] p-2">
                  No pass (declined or not generated)
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] uppercase tracking-[0.12em] text-brand-muted">{event.name}</p>
                <p className="text-[17px] font-medium leading-tight text-brand-ink">{c.name}</p>
                {c.designation && <p className="text-[13px] text-brand-muted">{c.designation}</p>}
                <p className="text-[13px] text-brand-ink"><strong>{c.category}</strong></p>
                <p className="text-[13px] text-brand-ink">{c.seat}</p>
                <p className="text-[12px] text-brand-muted">Ref {c.reference}</p>
                {c.qr && (
                  <a href={`/api/v1/passes/${c.guestId}`} className="no-print inline-block text-[12px] text-brand-blue underline">Download SVG</a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {cards.length === 0 && <p className="panel p-6 text-brand-muted">No guests are seated yet.</p>}
    </div>
  );
}
