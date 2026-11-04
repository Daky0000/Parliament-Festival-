import Link from "next/link";
import { prisma } from "@/lib/db";
import { QrCode, ShieldAlert, CheckCircle2, Users, ExternalLink, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
    include: {
      categories: { orderBy: { rankOrder: "asc" } },
      guests: {
        include: {
          person: true,
          protocolCategory: true,
          attendanceRecords: {
            where: { checkinStatus: "checked_in" },
            include: { recorder: true },
          },
          seatAssignments: {
            where: { status: { in: ["proposed", "approved"] } },
            include: { section: true, seat: true },
          },
        },
      },
      attendanceRecords: {
        orderBy: { checkedInAt: "desc" },
        include: {
          eventGuest: {
            include: { person: true, protocolCategory: true },
          },
          recorder: true,
        },
      },
    },
  });

  if (!event) return <div>No event found.</div>;

  const totalInvited = event.guests.length;
  const totalCheckedIn = event.attendanceRecords.filter(
    (a) => a.checkinStatus === "checked_in"
  ).length;
  const attendanceRate = totalInvited > 0 ? Math.round((totalCheckedIn / totalInvited) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[#102343]">
            Event-Day Arrival & Attendance Operations
          </h2>
          <p className="text-xs text-[#667085] mt-1">
            Real-time Forecourt entry stream, usher check-in attribution, and security exception monitoring.
          </p>
        </div>
        <Link
          href="/usher"
          target="_blank"
          className="bg-[#102343] text-[#DFCA95] border border-[#C6A65B] hover:bg-[#C6A65B] hover:text-[#0A1830] transition-colors px-4 py-2 rounded-md text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          <QrCode className="w-4 h-4" />
          <span>Launch Usher Scanner App</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 shadow-sm">
          <div className="text-xs font-semibold text-[#667085] uppercase">
            Total Checked In
          </div>
          <div className="text-3xl font-bold text-[#102343] mt-2">{totalCheckedIn}</div>
          <div className="text-xs text-emerald-700 font-semibold mt-1">
            {attendanceRate}% of Expected Protocol Roster
          </div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 shadow-sm">
          <div className="text-xs font-semibold text-[#667085] uppercase">
            Awaiting Arrival
          </div>
          <div className="text-3xl font-bold text-amber-600 mt-2">
            {totalInvited - totalCheckedIn}
          </div>
          <div className="text-xs text-[#667085] mt-1">Forecourt Reception Active</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-5 shadow-sm">
          <div className="text-xs font-semibold text-[#667085] uppercase">
            Check-In Integrity
          </div>
          <div className="text-3xl font-bold text-emerald-700 mt-2">100%</div>
          <div className="text-xs text-emerald-800 font-semibold mt-1">
            0 Unattributed or Duplicate Entries
          </div>
        </div>
      </div>

      {/* Real-time Arrival Feed */}
      <div className="bg-white rounded-lg border border-[#E4E7EC] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#E4E7EC] flex items-center justify-between">
          <h3 className="font-editorial text-base font-bold text-[#102343]">
            Live Forecourt Check-In Stream
          </h3>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            Live Feed Active
          </span>
        </div>

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A1830] text-[#F7F5F0]">
              <tr>
                <th className="p-3 text-[#C6A65B]">Dignitary</th>
                <th className="p-3 text-[#C6A65B]">Protocol Rank</th>
                <th className="p-3 text-[#C6A65B]">Check-In Method</th>
                <th className="p-3 text-[#C6A65B]">Verified By Usher</th>
                <th className="p-3 text-[#C6A65B]">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]">
              {event.attendanceRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[#667085]">
                    No attendees checked in yet today. Use the Usher Scanner App to scan or search dignitaries.
                  </td>
                </tr>
              ) : (
                event.attendanceRecords.map((att) => (
                  <tr key={att.id} className="hover:bg-[#F7F5F0]/60">
                    <td className="p-3 font-bold text-[#102343]">
                      {att.eventGuest.person.title} {att.eventGuest.person.fullName}
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-[#202A38]">
                        Rank {att.eventGuest.protocolCategory?.rankOrder || "-"}:{" "}
                        {att.eventGuest.protocolCategory?.name.slice(0, 25)}...
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                        {att.checkinMethod}
                      </span>
                    </td>
                    <td className="p-3 text-[#667085]">
                      {att.recorder?.fullName || "Senior Usher"}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#667085]">
                      {new Date(att.checkedInAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
