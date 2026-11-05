import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, requireGlobal } from "@/lib/authz";
import { sanitizeMetadata } from "@/lib/integrations";

export const GET = withActor(async (_req, { actor }) => {
  requireGlobal(actor, "platform.manage");
  const integrations = await prisma.platformIntegration.findMany({
    include: {
      credentials: {
        where: { status: "active", credentialKey: "apiKey" },
        select: { maskedHint: true },
        take: 1,
      },
      testLogs: {
        orderBy: { testedAt: "desc" },
        take: 3,
      },
    },
  });

  const aiConfigs = await prisma.aiProviderConfig.findMany({
    orderBy: [{ taskKey: "asc" }, { priority: "asc" }],
  });

  const recentTestLogs = await prisma.integrationTestLog.findMany({
    orderBy: { testedAt: "desc" },
    take: 10,
    include: { integration: true },
  });

  const totalSmsSent = await prisma.communicationMessage.count({
    where: { channel: "sms" },
  });

  const totalAiRequests = await prisma.aiUsageLog.count();

  return NextResponse.json({
    data: {
      platformOwner: "DakyXTech",
      environment: process.env.APP_ENV || "local",
      integrations: integrations.map((i) => ({
        id: i.id,
        providerKey: i.providerKey,
        displayName: i.displayName,
        integrationType: i.integrationType,
        status: i.status,
        isEnabled: i.isEnabled,
        maskedSecret: i.credentials[0]?.maskedHint || "Not Configured",
        lastTested: i.testLogs[0]?.testedAt || null,
        metadata: sanitizeMetadata(i.metadata),
      })),
      aiRouting: aiConfigs,
      recentTestLogs,
      metrics: {
        totalSmsSent,
        totalAiRequests,
        databaseStatus: "connected",
        queueStatus: "not_configured",
      },
    },
  });
});
