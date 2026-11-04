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
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
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
      <div className="bg-[#0A1830] border-2 border-[#C6A65B] rounded-lg p-6 text-white relative overflow-hidden shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#C6A65B] text-[#0A1830] text-[10px] font-bold px-2 py-0.5 rounded tracking-widest uppercase">
                Official Parliamentary Briefing
              </span>
              <span className="text-[#DFCA95] text-xs font-medium">
                Accra, Ghana
              </span>
            </div>
            <h2 className="font-editorial text-2xl font-bold tracking-tight text-[#FFFFFF]">
              {event.name}
            </h2>
            <p className="text-xs text-[#DFCA95]/80 mt-1 max-w-2xl">
              Real-time protocol reconciliation engine: individual invitation delivery, mathematical seating allocation, and event-day check-in operations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/guests/import"
              className="bg-[#102343] border border-[#C6A65B] text-[#DFCA95] hover:bg-[#C6A65B] hover:text-[#0A1830] transition-colors text-xs font-semibold px-4 py-2 rounded-md shadow-sm"
            >
              Import Guests
            </Link>
            <Link
              href="/invitations/campaigns"
              className="bg-[#C6A65B] text-[#0A1830] hover:bg-[#DFCA95] transition-colors text-xs font-bold px-4 py-2 rounded-md shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Campaigns
            </Link>
          </div>
        </div>
      </div>

      {/* Top 8 Operations Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white border border-[#E4E7EC] rounded-lg p-3 shadow-sm text-center">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider">
            Total Invited
          </div>
          <div className="text-xl font-bold text-[#102343] mt-1">{totalGuests}</div>
          <div className="text-[10px] text-emerald-700 font-medium mt-0.5">Protocol Roster</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-3 shadow-sm text-center">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider">
            Dispatched
          </div>
          <div className="text-xl font-bold text-[#102343] mt-1">{invitationsSent}</div>
          <div className="text-[10px] text-blue-700 font-medium mt-0.5">Approved Queue</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-3 shadow-sm text-center">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider">
            Delivered
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{deliveredCount}</div>
          <div className="text-[10px] text-emerald-800 font-medium mt-0.5">Provider Verified</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-3 shadow-sm text-center">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider">
            Open Signals
          </div>
          <div className="text-xl font-bold text-indigo-700 mt-1">{openSignalsCount}</div>
          <div className="text-[10px] text-indigo-800 font-medium mt-0.5">Image Signal</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-3 shadow-sm text-center">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider">
            Link Access
          </div>
          <div className="text-xl font-bold text-purple-700 mt-1">{linkAccessCount}</div>
          <div className="text-[10px] text-purple-800 font-medium mt-0.5">URL Clicks</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-3 shadow-sm text-center">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider">
            Confirmed
          </div>
          <div className="text-xl font-bold text-emerald-600 mt-1">{acceptedCount}</div>
          <div className="text-[10px] text-emerald-700 font-medium mt-0.5">RSVP Accepted</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-3 shadow-sm text-center">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider">
            Seats Assigned
          </div>
          <div className="text-xl font-bold text-[#C6A65B] mt-1">{totalSeatsAssigned}</div>
          <div className="text-[10px] text-[#A66A12] font-medium mt-0.5">Capacity: {totalCapacity}</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-3 shadow-sm text-center">
          <div className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider">
            Checked In
          </div>
          <div className="text-xl font-bold text-sky-700 mt-1">{checkedInCount}</div>
          <div className="text-[10px] text-sky-800 font-medium mt-0.5">Usher Validated</div>
        </div>
      </div>

      {/* Main Grid: Protocol Hierarchy Breakdown & Event Readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Protocol Precedence Breakdown */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-[#E4E7EC] p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4E7EC] mb-4">
            <div>
              <h3 className="font-editorial text-base font-bold text-[#102343]">
                Protocol Precedence & RSVP Status
              </h3>
              <p className="text-xs text-[#667085]">
                Distribution by approved parliamentary precedence order
              </p>
            </div>
            <Link
              href="/protocol"
              className="text-xs text-[#102343] font-semibold flex items-center gap-1 hover:text-[#C6A65B]"
            >
              Configure Ranks <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {categoryStats.map((cat) => (
              <div
                key={cat.id}
                className="border border-[#E4E7EC] rounded-md p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-[#C6A65B] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-sm flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  >
                    {cat.rank}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#102343]">{cat.name}</h4>
                    <p className="text-[11px] text-[#667085]">
                      Rank {cat.rank} &bull; Official Protocol Category
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <span className="text-[10px] text-[#667085] uppercase block">Invited</span>
                    <span className="font-bold text-[#102343]">{cat.count}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-[#667085] uppercase block">Confirmed</span>
                    <span className="font-bold text-emerald-700">{cat.accepted}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-[#667085] uppercase block">Seated</span>
                    <span className="font-bold text-[#C6A65B]">{cat.assigned}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Event Readiness & Quick AI Actions */}
        <div className="space-y-6">
          {/* Readiness Checklist */}
          <div className="bg-white rounded-lg border border-[#E4E7EC] p-5 shadow-sm">
            <h3 className="font-editorial text-base font-bold text-[#102343] mb-1">
              Event Readiness Status
            </h3>
            <p className="text-xs text-[#667085] mb-4">
              P0 & P1 operational release gates
            </p>

            <ul className="space-y-3 text-xs">
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#102343]">Event Scope & Venue Verified</span>
                  <p className="text-[11px] text-[#667085]">Forecourt of Parliament confirmed</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#102343]">Protocol Hierarchy Locked</span>
                  <p className="text-[11px] text-[#667085]">5 Precedence ranks active</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#102343]">Luxury Email Template Approved</span>
                  <p className="text-[11px] text-[#667085]">Version 1 signed off by Clerk</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#102343]">Deterministic Seating Ready</span>
                  <p className="text-[11px] text-[#667085]">5 sections with 250 capacity</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#102343]">Mobile Usher Scanner Active</span>
                  <p className="text-[11px] text-[#667085]">QR credential server validation</p>
                </div>
              </li>
            </ul>
          </div>

          {/* AI Command Centre Card */}
          <div className="bg-[#102343] border border-[#C6A65B] rounded-lg p-5 text-white shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-[#DFCA95]">
              <Sparkles className="w-4 h-4" />
              <h4 className="text-xs font-bold uppercase tracking-wider">AI Protocol Assistant</h4>
            </div>
            <p className="text-xs text-[#DFCA95]/80 mb-4">
              Query guest records, draft invitation reminder notices, or propose seating plans with institutional oversight.
            </p>
            <Link
              href="/ai-centre"
              className="w-full bg-[#C6A65B] text-[#0A1830] hover:bg-[#DFCA95] transition-colors text-xs font-bold py-2 px-3 rounded flex items-center justify-center gap-2"
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

