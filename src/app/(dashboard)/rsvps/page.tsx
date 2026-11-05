import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { prisma } from "@/lib/db";
import { CheckCircle2, XCircle, Clock, Users, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RsvpsPage() {
  const guard = await guardPage("rsvps.read", "/rsvps");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;

  const event = await prisma.event.findFirst({
    where: { id: guard.event.id },
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
    <div className="space-y-[var(--frame)]">
      <div className="panel px-6 py-6 sm:px-8 sm:py-7">
        <h2 className="font-editorial text-[28px] sm:text-[34px] leading-[1.1] font-normal tracking-[-0.035em] text-[#0D1526]">
          Attendance Responses & RSVP Intelligence
        </h2>
        <p className="text-[15px] leading-relaxed text-[#5B6374] mt-2 max-w-[70ch]">
          Real-time tracking of confirmed dignitaries, companion counts, and follow-up queues.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E3E6EB] rounded-lg p-4 ">
          <div className="flex items-center justify-between text-xs font-semibold text-[#5B6374] uppercase">
            <span>Accepted Principals</span>
            <CheckCircle2 className="w-4 h-4 text-[#3F6212]" />
          </div>
          <div className="text-2xl font-semibold text-[#3F6212] mt-2">{acceptedCount}</div>
          <div className="text-[11px] text-[#5B6374] mt-1">Confirmed Dignitaries</div>
        </div>

        <div className="bg-white border border-[#E3E6EB] rounded-lg p-4 ">
          <div className="flex items-center justify-between text-xs font-semibold text-[#5B6374] uppercase">
            <span>Accompanying Persons</span>
            <Users className="w-4 h-4 text-[#2563EB]" />
          </div>
          <div className="text-2xl font-semibold text-[#2563EB] mt-2">+{totalCompanions}</div>
          <div className="text-[11px] text-[#5B6374] mt-1">Permitted Companions</div>
        </div>

        <div className="bg-white border border-[#E3E6EB] rounded-lg p-4 ">
          <div className="flex items-center justify-between text-xs font-semibold text-[#5B6374] uppercase">
            <span>Total Expected Headcount</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]"></span>
          </div>
          <div className="text-2xl font-semibold text-[#091833] mt-2">{expectedHeadcount}</div>
          <div className="text-[11px] text-[#5B6374] mt-1">Principals + Companions</div>
        </div>

        <div className="bg-white border border-[#E3E6EB] rounded-lg p-4 ">
          <div className="flex items-center justify-between text-xs font-semibold text-[#5B6374] uppercase">
            <span>Pending Follow-ups</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-semibold text-amber-600 mt-2">{pendingCount}</div>
          <div className="text-[11px] text-[#5B6374] mt-1">Awaiting Formal Response</div>
        </div>
      </div>

      {/* Responses Table */}
      <div className="bg-white rounded-lg border border-[#E3E6EB] overflow-hidden">
        <div className="p-4 border-b border-[#E3E6EB] flex items-center justify-between">
          <h3 className="font-editorial text-base font-medium text-[#091833]">
            Attendance Confirmation Register
          </h3>
          <span className="text-xs text-[#5B6374] font-semibold">
            {responses.length} Dignitaries Monitored
          </span>
        </div>

        <div className="table-responsive-container">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F6F7F9] text-[#5B6374] border-b border-[#E3E6EB]">
              <tr>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Dignitary</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Protocol Precedence</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Institution</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Response</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Companions</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Confirmation Ref</th>
                <th className="p-3 text-[#5B6374] text-[11px] font-medium uppercase tracking-[0.12em]">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E3E6EB]">
              {responses.map(({ guest, status, companionCount, confirmationReference, submittedAt }) => (
                <tr key={guest.id} className="hover:bg-[#F6F7F9]/60">
                  <td className="p-3 font-semibold text-[#091833]">
                    {guest.person.title} {guest.person.fullName}
                  </td>
                  <td className="p-3">
                    <span className="font-medium text-[#0D1526]">
                      Rank {guest.protocolCategory?.rankOrder || "-"}: {guest.protocolCategory?.name.slice(0, 25)}...
                    </span>
                  </td>
                  <td className="p-3 text-[#5B6374]">{guest.institution?.name}</td>
                  <td className="p-3">
                    {status === "accepted" ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EEF6DC] text-[#3F6212]">
                        Accepted
                      </span>
                    ) : status === "declined" ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FDECEA] text-[#B42318]">
                        Declined
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-semibold text-[#091833]">
                    {status === "accepted" ? `+${companionCount}` : "-"}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-[#5B6374]">
                    {confirmationReference || "—"}
                  </td>
                  <td className="p-3 text-[11px] text-[#5B6374]">
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

