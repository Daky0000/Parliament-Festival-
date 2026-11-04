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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[#102343]">
            Guest Register & Protocol Directory
          </h2>
          <p className="text-xs text-[#667085] mt-1">
            Official roster of invited dignitaries, leaders, and state delegations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/guests/import"
            className="bg-white border border-[#E4E7EC] text-[#102343] hover:border-[#C6A65B] px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-2 shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#C6A65B]" />
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

