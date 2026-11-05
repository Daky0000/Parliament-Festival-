// Secret encryption and keyed hashing. Web Crypto only (Node + Workers).
//
// APP_ENCRYPTION_KEY (32 bytes, base64) is the root key; it never touches the
// database. Purpose-specific keys are derived with HKDF so the encryption key
// and the hashing key are independent.
//
// Ciphertext format: v1:<b64 iv>:<b64 ciphertext+tag>. Each ciphertext is bound
// to where it is stored (AES-GCM additional data, e.g. "users.mfaSecretEnc:<id>"),
// so a blob copied to another row or column fails to decrypt.
//
// Key rotation: introduce APP_ENCRYPTION_KEY_PREVIOUS and a "v2" prefix, read
// both, write v2, re-encrypt in a job. Losing the key makes MFA secrets and
// stored provider credentials unrecoverable; keep an offline backup.

const VERSION = "v1";
const enc = new TextEncoder();

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function decodeKey(raw: string | undefined): Uint8Array<ArrayBuffer> {
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set");
  const bytes = b64decode(raw);
  if (bytes.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to 32 bytes");
  return bytes;
}

async function rootKey(raw = process.env.APP_ENCRYPTION_KEY): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", decodeKey(raw), "HKDF", false, ["deriveKey"]);
}

async function derive(purpose: string, algo: AesKeyGenParams | HmacKeyGenParams, usages: KeyUsage[], raw?: string) {
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("parliament-festival"), info: enc.encode(purpose) },
    await rootKey(raw),
    algo,
    false,
    usages
  );
}

const aesKey = (raw?: string) => derive("secret-encryption-v1", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"], raw);

export async function encryptSecret(plain: string, context: string, rawKey?: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(context) },
    await aesKey(rawKey),
    enc.encode(plain)
  );
  return `${VERSION}:${b64encode(iv)}:${b64encode(new Uint8Array(ct))}`;
}

export async function decryptSecret(blob: string, context: string, rawKey?: string): Promise<string> {
  const [version, ivB64, ctB64] = blob.split(":");
  if (version !== VERSION || !ivB64 || !ctB64) throw new Error("Unrecognised secret format");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64), additionalData: enc.encode(context) },
    await aesKey(rawKey),
    b64decode(ctB64)
  );
  return new TextDecoder().decode(pt);
}

/** Last 4 characters only; never enough to reconstruct the value. */
export function maskSecret(plain: string): string {
  return plain.length > 8 ? `••••${plain.slice(-4)}` : "••••••••";
}

/**
 * HMAC-SHA256 of a normalised value (IPs, emails) for logs and rate limits,
 * so raw values are not stored. Falls back to a fixed dev key only when no
 * root key is configured (local/ci).
 */
export async function keyedHash(value: string, rawKey = process.env.APP_ENCRYPTION_KEY): Promise<string> {
  const key = rawKey
    ? await derive("keyed-hash-v1", { name: "HMAC", hash: "SHA-256" }, ["sign"], rawKey)
    : await crypto.subtle.importKey("raw", enc.encode("local-dev-hash-key"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value.toLowerCase().trim()));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** SHA-256 hex. Used for session ids and single-use token lookups. */
export async function sha256Hex(value: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return b64encode(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
