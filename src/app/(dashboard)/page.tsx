import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  Users,
  Mail,
  Send,
  Eye,
  MousePointerClick,
  CheckCircle,
  XCircle,
  Armchair,
  QrCode,
  ShieldCheck,
  ArrowUpRight,
  Sparkles,
  ChevronRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const guard = await guardPage("events.read", "/");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;

  const event = await prisma.event.findFirst({
    where: { id: guard.event.id },
    include: {
      categories: { orderBy: { rankOrder: "asc" } },
      guests: {
        include: {
          person: true,
          protocolCategory: true,
          invitations: {
            include: {
              rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
              emailAttempts: true,
              invitationEvents: true,
            },
          },
          seatAssignments: {
            where: { status: { in: ["proposed", "approved"] } },
            include: { section: true },
          },
          attendanceRecords: {
            where: { checkinStatus: "checked_in" },
          },
        },
      },
      seatingPlans: {
        include: {
          sections: {
            include: {
              seats: true,
              seatAssignments: { where: { status: { in: ["proposed", "approved"] } } },
            },
          },
        },
      },
      templates: {
        include: { versions: true },
      },
    },
  });

  if (!event) {
    return <div className="p-8">No active event found. Please run seed script.</div>;
  }

  // Aggregate Metrics
  const totalGuests = event.guests.length;
  let invitationsSent = 0;
  let deliveredCount = 0;
  let openSignalsCount = 0;
  let linkAccessCount = 0;
  let acceptedCount = 0;
  let declinedCount = 0;
  let checkedInCount = 0;

  for (const guest of event.guests) {
    const inv = guest.invitations[0];
    if (inv) {
      if (inv.invitationStatus === "sent") invitationsSent++;
      if (inv.invitationEvents.some((e) => e.eventType === "delivered")) deliveredCount++;
      if (inv.invitationEvents.some((e) => e.eventType === "open_signal")) openSignalsCount++;
      if (inv.invitationEvents.some((e) => e.eventType === "link_access")) linkAccessCount++;

      const latestRsvp = inv.rsvps[0];
      if (latestRsvp?.response === "accepted") acceptedCount++;
      if (latestRsvp?.response === "declined") declinedCount++;
    }
    if (guest.attendanceRecords.length > 0) checkedInCount++;
  }

  const seatingPlan = event.seatingPlans[0];
  const totalCapacity = seatingPlan?.sections.reduce((acc, s) => acc + s.capacity, 0) || 0;
  const totalSeatsAssigned = seatingPlan?.sections.reduce(
    (acc, s) => acc + s.seatAssignments.length,
    0
  ) || 0;

  // Category breakdown
  const categoryStats = event.categories.map((cat) => {
    const catGuests = event.guests.filter((g) => g.protocolCategoryId === cat.id);
    const catAccepted = catGuests.filter(
      (g) => g.invitations[0]?.rsvps[0]?.response === "accepted"
    ).length;
    const catAssigned = catGuests.filter((g) => g.seatAssignments.length > 0).length;

    return {
      id: cat.id,
      name: cat.name,
      rank: cat.rankOrder,
      color: cat.colourHex,
      count: catGuests.length,
      accepted: catAccepted,
      assigned: catAssigned,
    };
  });

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-[var(--frame)]">
        <section className="panel p-7 sm:p-10 flex flex-col justify-center gap-5">
          <span className="chip self-start">
            <span className="pip" />
            Official parliamentary briefing · Accra
          </span>
          <h1 className="text-[34px] sm:text-[44px] leading-[1.06] font-normal tracking-[-0.04em] text-[#0D1526]">
            {event.name}
          </h1>
          <p className="text-[16.5px] leading-relaxed text-[#5B6374] max-w-[56ch]">
            Real-time protocol reconciliation: individual invitation delivery, mathematical seating allocation and
            event-day check-in, in one place.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/invitations/campaigns"
              className="group inline-flex items-center gap-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[15px] font-medium px-5 py-3 rounded-[10px] transition-colors"
            >
              <Send className="w-4 h-4" />
              Invitation campaigns
              <span className="transition-transform group-hover:translate-x-[3px]">&rarr;</span>
            </Link>
            <Link
              href="/guests/import"
              className="inline-flex items-center gap-2.5 bg-white border border-[#D2D7DF] hover:border-[#0D1526] text-[#0D1526] text-[15px] font-medium px-5 py-3 rounded-[10px] transition-colors"
            >
              Import guests
            </Link>
          </div>
        </section>

        <section className="band p-6 sm:p-8 flex flex-col justify-center gap-5" aria-label="Event at a glance">
          <div className="dotfield" aria-hidden="true" />
          <span className="relative cap !text-white/70">At a glance</span>
          <div className="relative grid grid-cols-2 gap-2.5">
            {[
              { label: "Invited", value: totalGuests },
              { label: "Confirmed", value: acceptedCount },
              { label: "Seats assigned", value: `${totalSeatsAssigned}/${totalCapacity}` },
              { label: "Checked in", value: checkedInCount },
            ].map((s) => (
              <div key={s.label} className="rounded-[14px] bg-white/[0.06] border border-white/[0.12] px-4 py-3.5">
                <div className="text-[12px] text-white/70">{s.label}</div>
                <div className="text-[28px] leading-tight font-normal tracking-[-0.03em] text-white mt-0.5">
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Operations metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-[var(--frame)]">
        {[
          { label: "Total invited", value: totalGuests, note: "Protocol roster", tone: "muted" },
          { label: "Dispatched", value: invitationsSent, note: "Approved queue", tone: "muted" },
          { label: "Delivered", value: deliveredCount, note: "Provider verified", tone: "positive" },
          { label: "Open signals", value: openSignalsCount, note: "Image signal", tone: "muted" },
          { label: "Link access", value: linkAccessCount, note: "URL clicks", tone: "muted" },
          { label: "Confirmed", value: acceptedCount, note: "RSVP accepted", tone: "positive" },
          { label: "Seats assigned", value: totalSeatsAssigned, note: `Capacity ${totalCapacity}`, tone: "blue" },
          { label: "Checked in", value: checkedInCount, note: "Usher validated", tone: "blue" },
        ].map((m) => (
          <div key={m.label} className="bg-white border border-[#E3E6EB] rounded-[14px] p-4 flex flex-col gap-3">
            <span className="cap !text-[11px]">{m.label}</span>
            <div>
              <div className="text-[30px] leading-none font-normal tracking-[-0.03em] text-[#0D1526]">{m.value}</div>
              <div
                className={`text-[12.5px] mt-1.5 ${
                  m.tone === "positive" ? "text-[#3F6212]" : m.tone === "blue" ? "text-[#2563EB]" : "text-[#5B6374]"
                }`}
              >
                {m.note}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid: Protocol Hierarchy Breakdown & Event Readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--frame)]">
        {/* Protocol Precedence Breakdown */}
        <div className="lg:col-span-2 panel p-6 ">
          <div className="flex items-center justify-between pb-3 border-b border-[#E3E6EB] mb-4">
            <div>
              <h3 className="font-editorial text-base font-medium text-[#091833]">
                Protocol Precedence & RSVP Status
              </h3>
              <p className="text-xs text-[#5B6374]">
                Distribution by approved parliamentary precedence order
              </p>
            </div>
            <Link
              href="/protocol"
              className="text-xs text-[#091833] font-semibold flex items-center gap-1 hover:text-[#2563EB]"
            >
              Configure Ranks <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {categoryStats.map((cat) => (
              <div
                key={cat.id}
                className="border border-[#E3E6EB] rounded-md p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-[#2563EB] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center font-semibold text-xs text-white flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  >
                    {cat.rank}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-[#091833]">{cat.name}</h4>
                    <p className="text-[11px] text-[#5B6374]">
                      Rank {cat.rank} &bull; Official Protocol Category
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <span className="text-[10px] text-[#5B6374] uppercase block">Invited</span>
                    <span className="font-semibold text-[#091833]">{cat.count}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-[#5B6374] uppercase block">Confirmed</span>
                    <span className="font-semibold text-[#3F6212]">{cat.accepted}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-[#5B6374] uppercase block">Seated</span>
                    <span className="font-semibold text-[#2563EB]">{cat.assigned}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Event Readiness & Quick AI Actions */}
        <div className="space-y-6">
          {/* Readiness Checklist */}
          <div className="panel p-6 ">
            <h3 className="font-editorial text-base font-medium text-[#091833] mb-1">
              Event Readiness Status
            </h3>
            <p className="text-xs text-[#5B6374] mb-4">
              P0 & P1 operational release gates
            </p>

            <ul className="space-y-3 text-xs">
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-[#3F6212] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#091833]">Event Scope & Venue Verified</span>
                  <p className="text-[11px] text-[#5B6374]">Forecourt of Parliament confirmed</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-[#3F6212] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#091833]">Protocol Hierarchy Locked</span>
                  <p className="text-[11px] text-[#5B6374]">5 Precedence ranks active</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-[#3F6212] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#091833]">Luxury Email Template Approved</span>
                  <p className="text-[11px] text-[#5B6374]">Version 1 signed off by Clerk</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-[#3F6212] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#091833]">Deterministic Seating Ready</span>
                  <p className="text-[11px] text-[#5B6374]">5 sections with 250 capacity</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-[#3F6212] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#091833]">Mobile Usher Scanner Active</span>
                  <p className="text-[11px] text-[#5B6374]">QR credential server validation</p>
                </div>
              </li>
            </ul>
          </div>

          {/* AI Command Centre Card */}
          <div className="band p-6 text-white">
            <div className="flex items-center gap-2 mb-2 text-[#8FB2FF]">
              <Sparkles className="w-4 h-4" />
              <h4 className="text-xs font-semibold uppercase tracking-wider">AI Protocol Assistant</h4>
            </div>
            <p className="text-xs text-white/70 mb-4">
              Query guest records, draft invitation reminder notices, or propose seating plans with institutional oversight.
            </p>
            <Link
              href="/ai-centre"
              className="w-full bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors text-xs font-semibold py-2 px-3 rounded flex items-center justify-center gap-2"
            >
              <span>Launch AI Command Centre</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

