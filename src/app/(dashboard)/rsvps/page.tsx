import { prisma } from "@/lib/db";
import { CheckCircle2, XCircle, Clock, Users, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RsvpsPage() {
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
            },
          },
        },
      },
    },
  });

  if (!event) return <div>No event found.</div>;

  let acceptedCount = 0;
  let declinedCount = 0;
  let pendingCount = 0;
  let totalCompanions = 0;

  const responses = [];

  for (const guest of event.guests) {
    const latestRsvp = guest.invitations[0]?.rsvps[0];
    const status = latestRsvp?.response || "pending";

    if (status === "accepted") {
      acceptedCount++;
      totalCompanions += latestRsvp?.companionCount || 0;
    } else if (status === "declined") {
      declinedCount++;
    } else {
      pendingCount++;
    }

    responses.push({
      guest,
      status,
      companionCount: latestRsvp?.companionCount || 0,
      confirmationReference: latestRsvp?.confirmationReference,
      submittedAt: latestRsvp?.submittedAt,
    });
  }

  const expectedHeadcount = acceptedCount + totalCompanions;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-editorial text-2xl font-bold text-[#102343]">
          Attendance Responses & RSVP Intelligence
        </h2>
        <p className="text-xs text-[#667085] mt-1">
          Real-time tracking of confirmed dignitaries, companion counts, and follow-up queues.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E4E7EC] rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-[#667085] uppercase">
            <span>Accepted Principals</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2">{acceptedCount}</div>
          <div className="text-[11px] text-[#667085] mt-1">Confirmed Dignitaries</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-[#667085] uppercase">
            <span>Accompanying Persons</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-700 mt-2">+{totalCompanions}</div>
          <div className="text-[11px] text-[#667085] mt-1">Permitted Companions</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-[#667085] uppercase">
            <span>Total Expected Headcount</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#C6A65B]"></span>
          </div>
          <div className="text-2xl font-bold text-[#102343] mt-2">{expectedHeadcount}</div>
          <div className="text-[11px] text-[#667085] mt-1">Principals + Companions</div>
        </div>

        <div className="bg-white border border-[#E4E7EC] rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-[#667085] uppercase">
            <span>Pending Follow-ups</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-2">{pendingCount}</div>
          <div className="text-[11px] text-[#667085] mt-1">Awaiting Formal Response</div>
        </div>
      </div>

      {/* Responses Table */}
      <div className="bg-white rounded-lg border border-[#E4E7EC] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#E4E7EC] flex items-center justify-between">
          <h3 className="font-editorial text-base font-bold text-[#102343]">
            Attendance Confirmation Register
          </h3>
          <span className="text-xs text-[#667085] font-semibold">
            {responses.length} Dignitaries Monitored
          </span>
        </div>

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A1830] text-[#F7F5F0]">
              <tr>
                <th className="p-3 text-[#C6A65B]">Dignitary</th>
                <th className="p-3 text-[#C6A65B]">Protocol Precedence</th>
                <th className="p-3 text-[#C6A65B]">Institution</th>
                <th className="p-3 text-[#C6A65B]">Response</th>
                <th className="p-3 text-[#C6A65B]">Companions</th>
                <th className="p-3 text-[#C6A65B]">Confirmation Ref</th>
                <th className="p-3 text-[#C6A65B]">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]">
              {responses.map(({ guest, status, companionCount, confirmationReference, submittedAt }) => (
                <tr key={guest.id} className="hover:bg-[#F7F5F0]/60">
                  <td className="p-3 font-bold text-[#102343]">
                    {guest.person.title} {guest.person.fullName}
                  </td>
                  <td className="p-3">
                    <span className="font-medium text-[#202A38]">
                      Rank {guest.protocolCategory?.rankOrder || "-"}: {guest.protocolCategory?.name.slice(0, 25)}...
                    </span>
                  </td>
                  <td className="p-3 text-[#667085]">{guest.institution?.name}</td>
                  <td className="p-3">
                    {status === "accepted" ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Accepted
                      </span>
                    ) : status === "declined" ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        Declined
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-semibold text-[#102343]">
                    {status === "accepted" ? `+${companionCount}` : "-"}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-[#667085]">
                    {confirmationReference || "—"}
                  </td>
                  <td className="p-3 text-[11px] text-[#667085]">
                    {submittedAt ? new Date(submittedAt).toLocaleDateString() : "Pending"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
