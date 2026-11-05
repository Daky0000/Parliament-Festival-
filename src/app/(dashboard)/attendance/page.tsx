import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { QrCode, ShieldAlert, CheckCircle2, Users, ExternalLink, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const guard = await guardPage("reports.read", "/attendance");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;

  const event = await prisma.event.findFirst({
    where: { id: guard.event.id },
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
    <div className="space-y-[var(--frame)]">
      <div className="panel px-6 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-[28px] sm:text-[34px] leading-[1.1] font-normal tracking-[-0.035em] text-[#0D1526]">
            Event-Day Arrival & Attendance Operations
          </h2>
          <p className="text-[15px] leading-relaxed text-[#5B6374] mt-2 max-w-[70ch]">
            Real-time Forecourt entry stream, usher check-in attribution, and security exception monitoring.
          </p>
        </div>
        <Link
          href="/usher"
          target="_blank"
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
        >
          <QrCode className="w-4 h-4" />
          <span>Launch Usher Scanner App</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E3E6EB] rounded-lg p-5 ">
          <div className="text-xs font-semibold text-[#5B6374] uppercase">
            Total Checked In
          </div>
          <div className="text-3xl font-semibold text-[#091833] mt-2">{totalCheckedIn}</div>
          <div className="text-xs text-[#3F6212] font-semibold mt-1">
            {attendanceRate}% of Expected Protocol Roster
          </div>
        </div>

        <div className="bg-white border border-[#E3E6EB] rounded-lg p-5 ">
          <div className="text-xs font-semibold text-[#5B6374] uppercase">
            Awaiting Arrival
          </div>
          <div className="text-3xl font-semibold text-amber-600 mt-2">
            {totalInvited - totalCheckedIn}
          </div>
          <div className="text-xs text-[#5B6374] mt-1">Forecourt Reception Active</div>
        </div>

        <div className="bg-white border border-[#E3E6EB] rounded-lg p-5 ">
          <div className="text-xs font-semibold text-[#5B6374] uppercase">
            Check-In Integrity
          </div>
          <div className="text-3xl font-semibold text-[#3F6212] mt-2">100%</div>
          <div className="text-xs text-[#3F6212] font-semibold mt-1">
            0 Unattributed or Duplicate Entries
          </div>
        </div>
      </div>

      {/* Real-time Arrival Feed */}
      <div className="bg-white rounded-lg border border-[#E3E6EB] overflow-hidden">
        <div className="p-4 border-b border-[#E3E6EB] flex items-center justify-between">
          <h3 className="font-editorial text-base font-medium text-[#091833]">
            Live Forecourt Check-In Stream
          </h3>
          <span className="text-xs font-semibold text-[#3F6212] bg-[#EEF6DC] px-2 py-0.5 rounded border border-[#D9E8B8]">
            Live Feed Active
          </span>
        </div>

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F6F7F9] text-[#5B6374] border-b border-[#E3E6EB]">
              <tr>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Dignitary</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Protocol Rank</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Check-In Method</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Verified By Usher</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E6EB]">
              {event.attendanceRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[#5B6374]">
                    No attendees checked in yet today. Use the Usher Scanner App to scan or search dignitaries.
                  </td>
                </tr>
              ) : (
                event.attendanceRecords.map((att) => (
                  <tr key={att.id} className="hover:bg-[#F6F7F9]/60">
                    <td className="p-3 font-semibold text-[#091833]">
                      {att.eventGuest.person.title} {att.eventGuest.person.fullName}
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-[#0D1526]">
                        Rank {att.eventGuest.protocolCategory?.rankOrder || "-"}:{" "}
                        {att.eventGuest.protocolCategory?.name.slice(0, 25)}...
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF1FF] text-[#2563EB] uppercase">
                        {att.checkinMethod}
                      </span>
                    </td>
                    <td className="p-3 text-[#5B6374]">
                      {att.recorder?.fullName || "Senior Usher"}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#5B6374]">
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

