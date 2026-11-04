import { prisma } from "@/lib/db";
import { Award, ShieldCheck, Users, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProtocolPage() {
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
    include: {
      categories: {
        orderBy: { rankOrder: "asc" },
        include: {
          eventGuests: {
            include: { person: true, institution: true },
          },
        },
      },
    },
  });

  if (!event) return <div>No event found.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-editorial text-2xl font-bold text-[#102343]">
          Protocol Precedence Hierarchy
        </h2>
        <p className="text-xs text-[#667085] mt-1">
          Official ranking rules governing institutional precedence, invitation honorifics, and seating section eligibility.
        </p>
      </div>

      {/* Categories Cards */}
      <div className="space-y-4">
        {event.categories.map((cat) => (
          <div
            key={cat.id}
            className="bg-white border border-[#E4E7EC] rounded-lg p-5 shadow-sm hover:border-[#C6A65B] transition-all"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E4E7EC] gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-sm flex-shrink-0"
                  style={{ backgroundColor: cat.colourHex }}
                >
                  {cat.rankOrder}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-editorial text-base font-bold text-[#102343]">
                      {cat.name}
                    </h3>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: cat.colourHex }}
                    >
                      Rank {cat.rankOrder}
                    </span>
                  </div>
                  <p className="text-xs text-[#667085] mt-0.5">{cat.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-[#102343] bg-[#F7F5F0] px-3 py-1.5 rounded border border-[#E4E7EC]">
                <Users className="w-3.5 h-3.5 text-[#C6A65B]" />
                <span>{cat.eventGuests.length} Dignitaries Registered</span>
              </div>
            </div>

            {/* Guest Previews */}
            <div className="pt-3">
              <div className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider mb-2">
                Registered Dignitaries in this Rank
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                {cat.eventGuests.map((g) => (
                  <div
                    key={g.id}
                    className="p-2 rounded border border-[#E4E7EC] bg-[#F7F5F0]/40 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-[#102343]">
                        {g.person.title} {g.person.fullName}
                      </div>
                      <div className="text-[11px] text-[#667085]">
                        {g.person.designation || g.institution?.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
