import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { prisma } from "@/lib/db";
import { ProtocolClientView } from "./ProtocolClientView";

export const dynamic = "force-dynamic";

export default async function ProtocolPage() {
  const guard = await guardPage("protocol.read", "/protocol");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;

  const event = await prisma.event.findFirst({
    where: { id: guard.event.id },
    include: {
      categories: {
        orderBy: { rankOrder: "asc" },
        include: {
          eventGuests: {
            where: { guestStatus: "active" },
            include: {
              person: true,
              institution: true,
              invitations: {
                include: {
                  rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
                  emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
                  invitationEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
                },
                take: 1,
              },
              seatAssignments: {
                where: { status: { in: ["proposed", "approved"] } },
                include: { section: true, seat: true },
              },
            },
          },
        },
      },
      guests: {
        where: { guestStatus: "active" },
        include: {
          person: true,
          institution: true,
          protocolCategory: true,
        },
        orderBy: { person: { fullName: "asc" } },
      },
    },
  });

  if (!event) return <div>No active event found.</div>;

  return (
    <div className="space-y-[var(--frame)]">
      <div className="panel px-6 py-6 sm:px-8 sm:py-7">
        <h2 className="font-editorial text-[28px] sm:text-[34px] leading-[1.1] font-normal tracking-[-0.035em] text-[#0D1526]">
          Protocol Precedence Hierarchy
        </h2>
        <p className="text-[15px] leading-relaxed text-[#5B6374] mt-2 max-w-[70ch]">
          Official ranking rules governing institutional precedence, invitation honorifics, and seating section eligibility. Open any rank to inspect RSVPs, email open signals, and assigned seats.
        </p>
      </div>

      <ProtocolClientView
        eventId={event.id}
        initialCategories={event.categories as any}
        allGuests={event.guests}
      />
    </div>
  );
}
