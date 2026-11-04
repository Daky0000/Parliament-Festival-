import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const integrations = await prisma.platformIntegration.findMany({
    include: {
      credentials: {
        where: { status: "active" },
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
      environment: process.env.NODE_ENV || "production",
      integrations: integrations.map((i) => ({
        id: i.id,
        providerKey: i.providerKey,
        displayName: i.displayName,
        integrationType: i.integrationType,
        status: i.status,
        isEnabled: i.isEnabled,
        maskedSecret: i.credentials[0]?.maskedHint || "Not Configured",
        secretRef: i.credentials[0]?.secretReference || "none",
        lastTested: i.testLogs[0]?.testedAt || null,
        metadata: JSON.parse(i.metadata || "{}"),
      })),
      aiRouting: aiConfigs,
      recentTestLogs,
      metrics: {
        totalSmsSent,
        totalAiRequests,
        databaseStatus: "connected",
        queueStatus: "healthy",
      },
    },
  });
}

