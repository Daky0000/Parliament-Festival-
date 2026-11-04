import { prisma } from "@/lib/db";
import { SuperAdminOverviewClient } from "./SuperAdminOverviewClient";

export const dynamic = "force-dynamic";

export default async function SuperAdminOverviewPage() {
  const integrations = await prisma.platformIntegration.findMany({
    include: {
      credentials: { where: { status: "active" }, take: 1 },
      testLogs: { orderBy: { testedAt: "desc" }, take: 1 },
    },
  });

  const recentLogs = await prisma.integrationTestLog.findMany({
    orderBy: { testedAt: "desc" },
    take: 8,
    include: { integration: true },
  });

  const totalSmsCount = await prisma.communicationMessage.count({
    where: { channel: "sms" },
  });

  const totalAiRequests = await prisma.aiUsageLog.count();

  return (
    <div className="space-y-6">
      <SuperAdminOverviewClient
        initialIntegrations={integrations}
        initialLogs={recentLogs}
        metrics={{ totalSmsCount, totalAiRequests }}
      />
    </div>
  );
}

