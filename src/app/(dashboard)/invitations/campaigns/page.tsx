import { prisma } from "@/lib/db";
import { CampaignsClientView } from "./CampaignsClientView";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const event = await prisma.event.findFirst({
    where: { eventCode: "CAROLS-2026" },
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
    <div className="space-y-6">
      <div>
        <h2 className="font-editorial text-2xl font-bold text-[#102343]">
          Invitation Campaigns & Delivery Reconciliation
        </h2>
        <p className="text-xs text-[#667085] mt-1">
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

