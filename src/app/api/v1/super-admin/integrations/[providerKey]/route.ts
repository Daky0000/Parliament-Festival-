import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { updateEnvVariables } from "@/lib/env-manager";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ providerKey: string }> }
) {
  const { providerKey } = await context.params;
  const user = await getCurrentUser();
  const body = await request.json();
  const { action, isEnabled, metadata, newSecretPlain, extraCredentials } = body;

  const integration = await prisma.platformIntegration.findUnique({
    where: { providerKey },
    include: { credentials: true },
  });

  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  // 1. ROTATE OR UPDATE SECRET
  if ((action === "rotate_secret" || action === "update_key") && newSecretPlain) {
    // Writing .env only works on a developer machine. Deployed environments
    // take secrets from `wrangler secret put`; Phase 1 replaces this path
    // with encrypted credential storage. Refuse before any DB write.
    if (process.env.APP_ENV !== "local") {
      return NextResponse.json(
        { error: "Secret rotation from the UI is disabled in deployed environments." },
        { status: 501 }
      );
    }
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

    // Sync to .env and process.env
    const envUpdates: Record<string, string> = {};
    if (providerKey === "openai") envUpdates["OPENAI_API_KEY"] = newSecretPlain;
    if (providerKey === "anthropic") envUpdates["ANTHROPIC_API_KEY"] = newSecretPlain;
    if (providerKey === "resend") envUpdates["RESEND_API_KEY"] = newSecretPlain;
    if (providerKey === "vynfy") envUpdates["VYNFY_API_KEY"] = newSecretPlain;
    if (providerKey === "cloudflare") envUpdates["CLOUDFLARE_API_TOKEN"] = newSecretPlain;

    // Handle extra credentials if provided (e.g. for Cloudflare R2 or custom configs)
    if (extraCredentials && typeof extraCredentials === "object") {
      if (extraCredentials.accountId) envUpdates["CLOUDFLARE_ACCOUNT_ID"] = extraCredentials.accountId;
      if (extraCredentials.r2AccessKeyId) envUpdates["CLOUDFLARE_R2_ACCESS_KEY_ID"] = extraCredentials.r2AccessKeyId;
      if (extraCredentials.r2SecretAccessKey) envUpdates["CLOUDFLARE_R2_SECRET_ACCESS_KEY"] = extraCredentials.r2SecretAccessKey;
      if (extraCredentials.r2Endpoint) envUpdates["CLOUDFLARE_R2_ENDPOINT"] = extraCredentials.r2Endpoint;
      if (extraCredentials.r2Bucket) envUpdates["CLOUDFLARE_R2_BUCKET"] = extraCredentials.r2Bucket;
      if (extraCredentials.senderId) envUpdates["VYNFY_SENDER_ID"] = extraCredentials.senderId;
      if (extraCredentials.fromEmail) envUpdates["RESEND_FROM_EMAIL"] = extraCredentials.fromEmail;
    }

    if (Object.keys(envUpdates).length > 0) {
      updateEnvVariables(envUpdates);
    }

    // If metadata provided or updated with extra credentials
    let mergedMetadata = integration.metadata;
    if (extraCredentials || metadata) {
      try {
        const currentMeta = JSON.parse(integration.metadata || "{}");
        const nextMeta = { ...currentMeta, ...(metadata || {}), ...(extraCredentials || {}) };
        mergedMetadata = JSON.stringify(nextMeta);
        await prisma.platformIntegration.update({
          where: { id: integration.id },
          data: { metadata: mergedMetadata },
        });
      } catch (e) {}
    }

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
        metadata: mergedMetadata,
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
    include: { credentials: { where: { status: "active" }, take: 1 } },
  });

  return NextResponse.json({ data: updated });
}
