import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "./db";
import { getProviderSecret, sanitizeMetadata } from "./integrations";

// Media storage on Cloudflare R2 (S3-compatible). Every uploaded image or
// file goes through here; build assets in public/ stay with the app.
//
// Config: env first (CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_BUCKET,
// CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, optional
// CLOUDFLARE_R2_PUBLIC_BASE_URL), then the Cloudflare record in
// Super Admin → Integrations. The bucket is private: pages get signed URLs.

export class StorageNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`R2 storage is not configured (missing: ${missing.join(", ")}).`);
  }
}

type StorageConfig = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; publicBaseUrl: string | null };

let cached: { config: StorageConfig; client: S3Client } | null = null;

async function loadConfig(): Promise<StorageConfig> {
  let meta: Record<string, unknown> = {};
  if (!process.env.CLOUDFLARE_R2_ENDPOINT || !process.env.CLOUDFLARE_R2_BUCKET) {
    const row = await prisma.platformIntegration.findUnique({ where: { providerKey: "cloudflare" } }).catch(() => null);
    meta = sanitizeMetadata(row?.metadata);
  }
  const config = {
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT || String(meta.r2Endpoint ?? ""),
    bucket: process.env.CLOUDFLARE_R2_BUCKET || String(meta.r2Bucket ?? ""),
    accessKeyId: (await getProviderSecret("cloudflare", "r2AccessKeyId")) ?? "",
    secretAccessKey: (await getProviderSecret("cloudflare", "r2SecretAccessKey")) ?? "",
    publicBaseUrl: process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") || null,
  };
  const missing = (["endpoint", "bucket", "accessKeyId", "secretAccessKey"] as const).filter((k) => !config[k]);
  if (missing.length) throw new StorageNotConfiguredError(missing);
  return config;
}

async function storage() {
  if (!cached) {
    const config = await loadConfig();
    const client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    cached = { config, client };
  }
  return cached;
}

/** Object keys are app-controlled: letters, digits and . _ - / only, no "..". */
export function assertSafeKey(key: string): void {
  if (!/^[A-Za-z0-9._\-/]{1,512}$/.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export async function putObject(key: string, body: Uint8Array | Buffer | string, contentType: string): Promise<void> {
  assertSafeKey(key);
  const { config, client } = await storage();
  await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
}

/** Time-limited read URL for a private object (default 15 minutes, max 7 days). */
export async function signedGetUrl(key: string, ttlSeconds = 900): Promise<string> {
  assertSafeKey(key);
  const { config, client } = await storage();
  const expiresIn = Math.min(Math.max(ttlSeconds, 60), 7 * 24 * 3600);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn });
}

/** Permanent URL, only for objects under a public custom domain (e.g. logos on guest passes). */
export async function publicUrl(key: string): Promise<string | null> {
  assertSafeKey(key);
  const { config } = await storage();
  return config.publicBaseUrl ? `${config.publicBaseUrl}/${key}` : null;
}

export async function deleteObject(key: string): Promise<void> {
  assertSafeKey(key);
  const { config, client } = await storage();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

/** Clears the cached client, e.g. after credentials change in the console. */
export function resetStorageClient(): void {
  cached = null;
}
