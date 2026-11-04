import Link from "next/link";
import { prisma } from "@/lib/db";
import { FileSpreadsheet, Award, QrCode } from "lucide-react";
import { GuestsClientView } from "./GuestsClientView";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
    include: {
      categories: { orderBy: { rankOrder: "asc" } },
      guests: {
        where: { guestStatus: "active" },
        include: {
          person: true,
          protocolCategory: true,
          institution: true,
          invitations: {
            include: {
              rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
              emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
              invitationEvents: { orderBy: { occurredAt: "desc" }, take: 2 },
            },
          },
          seatAssignments: {
            where: { status: { in: ["proposed", "approved"] } },
            include: { section: true, seat: true },
          },
        },
        orderBy: [
          { protocolCategory: { rankOrder: "asc" } },
          { person: { fullName: "asc" } },
        ],
      },
      seatingPlans: {
        where: { status: { in: ["proposed", "approved", "draft"] } },
        orderBy: { versionNumber: "desc" },
        include: {
          sections: {
            orderBy: { displayOrder: "asc" },
            include: { seats: true },
          },
        },
        take: 1,
      },
    },
  });

  if (!event) return <div>No active event found.</div>;

  return (
    <div className="space-y-[var(--frame)]">
      <div className="panel px-6 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-[28px] sm:text-[34px] leading-[1.1] font-normal tracking-[-0.035em] text-[#0D1526]">
            Guest Register &amp; Protocol Directory
          </h2>
          <p className="text-[15px] leading-relaxed text-[#5B6374] mt-2 max-w-[70ch]">
            Official roster of invited dignitaries, leaders, and state delegations. Add individual dignitaries, inspect precedence ranks, and generate security pass credentials.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/protocol"
            className="bg-white border border-[#E3E6EB] text-[#091833] hover:border-[#2563EB] px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Award className="w-3.5 h-3.5 text-[#2563EB]" />
            Precedence Ranks
          </Link>
          <Link
            href="/invitations/templates"
            className="bg-white border border-[#E3E6EB] text-[#091833] hover:border-[#2563EB] px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <QrCode className="w-3.5 h-3.5 text-[#2563EB]" />
            Pass Templates
          </Link>
          <Link
            href="/guests/import"
            className="bg-white border border-[#E3E6EB] text-[#091833] hover:border-[#2563EB] px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#2563EB]" />
            Import CSV / XLSX
          </Link>
        </div>
      </div>

      <GuestsClientView
        eventId={event.id}
        initialGuests={event.guests}
        categories={event.categories}
        seatingSections={event.seatingPlans[0]?.sections || []}
      />
    </div>
  );
}
