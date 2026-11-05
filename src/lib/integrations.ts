import { prisma } from "./db";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto";

// Provider credentials. Values entered in the Super Admin console are stored
// encrypted (one row per credentialKey); deployment secrets in the runtime
// environment are the fallback. Nothing here ever returns a secret to a client.

/** Credential keys accepted per provider, and the env var used as fallback. */
export const CREDENTIALS: Record<string, Record<string, string>> = {
  openai: { apiKey: "OPENAI_API_KEY" },
  anthropic: { apiKey: "ANTHROPIC_API_KEY" },
  resend: { apiKey: "RESEND_API_KEY", webhookSecret: "RESEND_WEBHOOK_SECRET" },
  vynfy: { apiKey: "VYNFY_API_KEY" },
  cloudflare: {
    apiKey: "CLOUDFLARE_API_TOKEN",
    r2AccessKeyId: "CLOUDFLARE_R2_ACCESS_KEY_ID",
    r2SecretAccessKey: "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  },
};

/** Non-secret settings that may be stored in metadata and shown in the UI. */
export const PUBLIC_METADATA_KEYS = new Set([
  "accountBalanceEstimate", "countryCode", "defaultModel", "description", "emergencyKillSwitchActive",
  "r2Bucket", "r2Endpoint", "accountId", "rateLimitPerSec", "replyToEmail", "role", "senderEmail",
  "senderId", "senderName", "sslMode", "turnstileActive", "verifiedDomain", "wafActive", "website",
  "zoneName", "fromEmail",
]);

/** Drops anything not on the allow-list (used on both read and write). */
export function sanitizeMetadata(meta: unknown): Record<string, unknown> {
  let obj: unknown = meta;
  if (typeof meta === "string") {
    try {
      obj = JSON.parse(meta || "{}");
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== "object") return {};
  return Object.fromEntries(Object.entries(obj as Record<string, unknown>).filter(([k]) => PUBLIC_METADATA_KEYS.has(k)));
}

const context = (integrationId: string, credentialKey: string) =>
  `integration_credentials:${integrationId}:${credentialKey}`;

export async function storeCredential(opts: {
  integrationId: string;
  credentialKey: string;
  plain: string;
  createdBy: string;
  environment: string;
  providerKey: string;
}): Promise<{ maskedHint: string; credentialVersion: number }> {
  const previous = await prisma.integrationCredential.count({
    where: { integrationId: opts.integrationId, credentialKey: opts.credentialKey },
  });
  return prisma.$transaction(async (tx) => {
    await tx.integrationCredential.updateMany({
      where: { integrationId: opts.integrationId, credentialKey: opts.credentialKey, status: "active" },
      data: { status: "rotated", rotatedAt: new Date() },
    });
    const created = await tx.integrationCredential.create({
      data: {
        integrationId: opts.integrationId,
        credentialKey: opts.credentialKey,
        secretReference: `db://${opts.environment}/${opts.providerKey}/${opts.credentialKey}/v${previous + 1}`,
        secretCiphertext: await encryptSecret(opts.plain, context(opts.integrationId, opts.credentialKey)),
        maskedHint: maskSecret(opts.plain),
        credentialVersion: previous + 1,
        status: "active",
        createdBy: opts.createdBy,
      },
    });
    return { maskedHint: created.maskedHint, credentialVersion: created.credentialVersion };
  });
}

/** Active stored credential, else the deployment environment variable, else null. */
export async function getProviderSecret(providerKey: string, credentialKey = "apiKey"): Promise<string | null> {
  const envVar = CREDENTIALS[providerKey]?.[credentialKey];
  const integration = await prisma.platformIntegration.findUnique({
    where: { providerKey },
    include: { credentials: { where: { status: "active", credentialKey }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const cred = integration?.credentials[0];
  if (cred?.secretCiphertext) {
    return decryptSecret(cred.secretCiphertext, context(integration!.id, credentialKey));
  }
  return (envVar && process.env[envVar]) || null;
}
