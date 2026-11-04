import crypto from "crypto";
import QRCode from "qrcode";

export interface GeneratedToken {
  rawToken: string;
  tokenHash: string;
}

/**
 * Generates a cryptographically strong, unpredictable token (32 bytes = 256 bits of entropy)
 * and its SHA-256 hash for secure database storage.
 */
export function generateSecureToken(): GeneratedToken {
  const rawBytes = crypto.randomBytes(32);
  const rawToken = rawBytes.toString("base64url");
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Computes a SHA-256 hex hash of any token.
 * We store only the hash in the database to prevent token leakage even if DB is compromised.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generates an opaque reference code (e.g. GH-CAROLS-8291)
 */
export function generateReferenceCode(prefix = "GH-CAROLS"): string {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${randomNum}`;
}

/**
 * Generates an opaque QR code image (Data URL).
 * Encodes only the opaque credential hash or verification URL, NEVER personal data!
 */
export async function generateQrCodeDataUrl(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: "H",
    margin: 2,
    color: {
      dark: "#0A1830", // Deep Navy
      light: "#FFFFFF",
    },
    width: 320,
  });
}
