import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, requireGlobal } from "@/lib/authz";
import { HttpError, notFound, readJson } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";
import { CREDENTIALS, sanitizeMetadata, storeCredential } from "@/lib/integrations";

const Body = z.object({
  action: z.enum(["rotate_secret", "update_key", "toggle", "update_metadata"]).optional(),
  isEnabled: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  newSecretPlain: z.string().min(8).max(4096).optional(),
  extraCredentials: z.record(z.string(), z.string().max(4096)).optional(),
});

export const PATCH = withActor<{ providerKey: string }>(async (request, { actor, params }) => {
  requireGlobal(actor, "platform.manage");
  const { providerKey } = params;
  const body = Body.parse(await readJson(request));

  const integration = await prisma.platformIntegration.findUnique({ where: { providerKey } });
  if (!integration) throw notFound();
  const allowedKeys = CREDENTIALS[providerKey] ?? {};

  // Secrets: newSecretPlain is the provider's main key; extraCredentials may
  // hold further secret keys (e.g. R2) and non-secret settings.
  const secrets: Record<string, string> = {};
  const settings: Record<string, unknown> = {};
  if (body.newSecretPlain) secrets.apiKey = body.newSecretPlain;
  for (const [k, v] of Object.entries(body.extraCredentials ?? {})) {
    if (!v) continue;
    if (k in allowedKeys) secrets[k] = v;
    else settings[k] = v;
  }

  const rotated: { credentialKey: string; maskedHint: string; credentialVersion: number }[] = [];
  for (const [credentialKey, plain] of Object.entries(secrets)) {
    if (!(credentialKey in allowedKeys)) throw new HttpError(400, `Unknown credential ${credentialKey}`);
    const r = await storeCredential({
      integrationId: integration.id,
      credentialKey,
      plain,
      createdBy: actor.fullName,
      environment: integration.environment,
      providerKey,
    });
    rotated.push({ credentialKey, ...r });
    await logAuditEvent({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "integration.credential_rotated",
      entityType: "platform_integration",
      entityId: integration.id,
      reason: `${providerKey}.${credentialKey} v${r.credentialVersion}`,
    });
  }

  const nextMeta = sanitizeMetadata({ ...sanitizeMetadata(integration.metadata), ...(body.metadata ?? {}), ...settings });
  const updated = await prisma.platformIntegration.update({
    where: { id: integration.id },
    data: {
      ...(typeof body.isEnabled === "boolean" ? { isEnabled: body.isEnabled } : {}),
      metadata: JSON.stringify(nextMeta),
    },
  });
  if (typeof body.isEnabled === "boolean" || body.metadata) {
    await logAuditEvent({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "integration.settings_updated",
      entityType: "platform_integration",
      entityId: integration.id,
      afterData: { isEnabled: updated.isEnabled, metadataKeys: Object.keys(nextMeta) },
    });
  }

  return NextResponse.json({
    data: {
      providerKey,
      isEnabled: updated.isEnabled,
      metadata: nextMeta,
      rotated,
      maskedHint: rotated.find((r) => r.credentialKey === "apiKey")?.maskedHint,
    },
  });
});
