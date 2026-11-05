import { guardPage } from "@/lib/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { prisma } from "@/lib/db";
import { CampaignsClientView } from "./CampaignsClientView";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const guard = await guardPage("campaigns.read", "/invitations/campaigns");
  if (!guard.ok) return <AccessDenied reason={guard.reason} />;

  const event = await prisma.event.findFirst({
    where: { id: guard.event.id },
    include: {
      categories: { orderBy: { rankOrder: "asc" } },
      templates: {
        include: { versions: { where: { status: "approved" } } },
      },
      campaigns: {
        orderBy: { createdAt: "desc" },
        include: {
          templateVersion: { include: { template: true } },
          creator: true,
          approver: true,
          invitations: {
            include: {
              eventGuest: { include: { person: true, protocolCategory: true } },
              emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
              invitationEvents: { orderBy: { occurredAt: "desc" }, take: 3 },
              rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!event) return <div>No event found.</div>;

  return (
    <div className="space-y-[var(--frame)]">
      <div className="panel px-6 py-6 sm:px-8 sm:py-7">
        <h2 className="font-editorial text-[28px] sm:text-[34px] leading-[1.1] font-normal tracking-[-0.035em] text-[#0D1526]">
          Invitation Campaigns & Delivery Reconciliation
        </h2>
        <p className="text-[15px] leading-relaxed text-[#5B6374] mt-2 max-w-[70ch]">
          Compose luxury digital invitations, execute approval workflows, and trace per-recipient delivery events.
        </p>
      </div>

      <CampaignsClientView
        eventId={event.id}
        initialCampaigns={event.campaigns}
        templates={event.templates}
        categories={event.categories}
      />
    </div>
  );
}

