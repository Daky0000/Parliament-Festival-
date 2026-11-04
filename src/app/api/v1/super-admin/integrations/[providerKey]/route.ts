import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ providerKey: string }> }
) {
  const { providerKey } = await context.params;
  const user = await getCurrentUser();
  const body = await request.json();
  const { action, isEnabled, metadata, newSecretPlain } = body;

  const integration = await prisma.platformIntegration.findUnique({
    where: { providerKey },
    include: { credentials: true },
  });

  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  // 1. ROTATE SECRET
  if (action === "rotate_secret" && newSecretPlain) {
    const hint =
      newSecretPlain.length > 8
        ? `${newSecretPlain.slice(0, 4)}...${newSecretPlain.slice(-4)}`
        : "••••••••";

    // Mark previous active credentials as rotated
    await prisma.integrationCredential.updateMany({
      where: { integrationId: integration.id, status: "active" },
      data: { status: "rotated", rotatedAt: new Date() },
    });

    const newCred = await prisma.integrationCredential.create({
      data: {
        integrationId: integration.id,
        secretReference: `vault://${integration.environment}/${providerKey}/key-v${Date.now()}`,
        maskedHint: hint,
        credentialVersion: (integration.credentials.length || 0) + 1,
        status: "active",
        createdBy: user?.fullName || "Super Admin",
      },
    });

    if (user) {
      await logAuditEvent({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        actorType: "user",
        action: "PROVIDER_SECRET_ROTATED",
        entityType: "platform_integration",
        entityId: integration.id,
        reason: `Rotated credential for provider ${providerKey}`,
      });
    }

    return NextResponse.json({
      data: {
        providerKey,
        maskedHint: newCred.maskedHint,
        credentialVersion: newCred.credentialVersion,
      },
    });
  }

  // 2. TOGGLE ENABLED / METADATA
  const updated = await prisma.platformIntegration.update({
    where: { providerKey },
    data: {
      ...(typeof isEnabled === "boolean" ? { isEnabled } : {}),
      ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
    },
  });

  return NextResponse.json({ data: updated });
}
