import type { Prisma, PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from "./crypto";
import { appOrigin } from "./config";

// Guest-facing credentials: invitation (RSVP) links and QR passes.
// The database stores sha256(token) for lookups plus an AES-GCM copy of the
// raw token (so a link or pass can be shown again). Neither the hash nor the
// raw token is ever returned by a staff API.

type Tx = Prisma.TransactionClient | PrismaClient;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** e.g. GH-GST-7K3QX9PA: 40 bits of randomness, no ambiguous characters. */
export function referenceCode(prefix: string, length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return `${prefix}-${Array.from(bytes, (b) => CROCKFORD[b & 31]).join("")}`;
}

/** Runs `create` with fresh reference codes until it does not hit a unique-key collision. */
export async function withUniqueReference<T>(prefix: string, create: (ref: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await create(referenceCode(prefix));
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002" || attempt === 4) throw err;
    }
  }
  throw new Error("unreachable");
}

export function rsvpUrl(rawToken: string): string {
  return `${appOrigin()}/public/v1/invitations/${rawToken}`;
}

export function scanUrl(rawToken: string): string {
  return `${appOrigin()}/check-in/scan/${rawToken}`;
}

/** Creates an invitation with a fresh link token. Returns the raw token for building the RSVP URL. */
export async function issueInvitation(
  tx: Tx,
  data: Omit<Prisma.InvitationUncheckedCreateInput, "tokenHash" | "tokenEnc" | "invitationReference" | "id">
): Promise<{ invitation: { id: string; invitationReference: string }; rawToken: string }> {
  const rawToken = randomToken(32);
  const id = crypto.randomUUID();
  const tokenHash = await sha256Hex(rawToken);
  const tokenEnc = await encryptSecret(rawToken, `invitations.tokenEnc:${id}`);
  const invitation = await withUniqueReference("GH-INV", (invitationReference) =>
    tx.invitation.create({
      data: { ...data, id, invitationReference, tokenHash, tokenEnc },
      select: { id: true, invitationReference: true },
    })
  );
  return { invitation, rawToken };
}

/** The raw invitation token, for re-sending the same link. */
export async function invitationRawToken(inv: { id: string; tokenEnc: string | null }): Promise<string | null> {
  return inv.tokenEnc ? decryptSecret(inv.tokenEnc, `invitations.tokenEnc:${inv.id}`) : null;
}

/** Ensures exactly one active, unexpired QR credential for an invitation. */
export async function ensureActiveCredential(
  tx: Tx,
  opts: { invitationId: string; eventId: string; expiresAt: Date | null }
): Promise<{ id: string; rawToken: string }> {
  const now = new Date();
  const existing = await tx.qrCredential.findFirst({ where: { invitationId: opts.invitationId, status: "active" } });
  if (existing && (!existing.expiresAt || existing.expiresAt > now) && existing.tokenEnc) {
    return { id: existing.id, rawToken: await decryptSecret(existing.tokenEnc, `qr_credentials.tokenEnc:${existing.id}`) };
  }
  if (existing) {
    await tx.qrCredential.update({ where: { id: existing.id }, data: { status: "expired", revokedAt: now } });
  }
  const rawToken = randomToken(32);
  const id = crypto.randomUUID();
  await tx.qrCredential.create({
    data: {
      id,
      eventId: opts.eventId,
      invitationId: opts.invitationId,
      credentialHash: await sha256Hex(rawToken),
      tokenEnc: await encryptSecret(rawToken, `qr_credentials.tokenEnc:${id}`),
      status: "active",
      expiresAt: opts.expiresAt,
    },
  });
  return { id, rawToken };
}

export async function revokeCredentials(tx: Tx, invitationId: string): Promise<number> {
  const res = await tx.qrCredential.updateMany({
    where: { invitationId, status: "active" },
    data: { status: "revoked", revokedAt: new Date() },
  });
  return res.count;
}

/** QR image of the scan URL. Encodes no personal data. */
export async function passQrDataUrl(rawToken: string): Promise<string> {
  return QRCode.toDataURL(scanUrl(rawToken), {
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#0A1830", light: "#FFFFFF" },
    width: 320,
  });
}

/** Looks up a QR credential by the raw token from a scanned URL. */
export async function findCredentialByToken(tx: Tx, rawToken: string) {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 100) return null;
  return tx.qrCredential.findUnique({ where: { credentialHash: await sha256Hex(rawToken) } });
}
