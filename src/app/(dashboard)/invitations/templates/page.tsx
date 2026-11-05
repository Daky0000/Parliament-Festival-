import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { prisma } from "@/lib/db";
import { TemplateStudioClientView } from "./TemplateStudioClientView";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const guard = await guardPage("campaigns.read", "/invitations/templates");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;

  const event = await prisma.event.findFirst({
    where: { id: guard.event.id },
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
            },
            take: 1,
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
            include: { protocolCategory: true },
          },
        },
        take: 1,
      },
    },
  });

  if (!event) return <div>No active event found.</div>;

  return (
    <div className="space-y-[var(--frame)]">
      <div className="panel px-6 py-6 sm:px-8 sm:py-7">
        <h2 className="font-editorial text-[28px] sm:text-[34px] leading-[1.1] font-normal tracking-[-0.035em] text-[#0D1526]">
          Official Dignitary Template &amp; Pass Studio
        </h2>
        <p className="text-[15px] leading-relaxed text-[#5B6374] mt-2 max-w-[70ch]">
          Live preview and visual inspector for official state credentials, invitation cards, and digital dispatches. Displays each dignitary&apos;s full name, company, protocol rank, and seat reference.
        </p>
      </div>

      <TemplateStudioClientView
        event={event}
        guests={event.guests}
        categories={event.categories}
        seatingSections={event.seatingPlans[0]?.sections || []}
      />
    </div>
  );
}

