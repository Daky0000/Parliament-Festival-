import Link from "next/link";
import { prisma } from "@/lib/db";
import { Users, FileSpreadsheet, Plus, Search, CheckCircle, Clock, XCircle, Armchair } from "lucide-react";
import { GuestsClientView } from "./GuestsClientView";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
    include: {
      categories: { orderBy: { rankOrder: "asc" } },
      guests: {
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
    },
  });

  if (!event) return <div>No active event found.</div>;

  return (
    <div className="space-y-[var(--frame)]">
      <div className="panel px-6 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-[28px] sm:text-[34px] leading-[1.1] font-normal tracking-[-0.035em] text-[#0D1526]">
            Guest Register & Protocol Directory
          </h2>
          <p className="text-[15px] leading-relaxed text-[#5B6374] mt-2 max-w-[70ch]">
            Official roster of invited dignitaries, leaders, and state delegations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/guests/import"
            className="bg-white border border-[#E3E6EB] text-[#091833] hover:border-[#2563EB] px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-2 "
          >
            <FileSpreadsheet className="w-4 h-4 text-[#2563EB]" />
            Import CSV / XLSX
          </Link>
        </div>
      </div>

      <GuestsClientView
        eventId={event.id}
        initialGuests={event.guests}
        categories={event.categories}
      />
    </div>
  );
}

