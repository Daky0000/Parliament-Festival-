import type { Prisma, PrismaClient } from "@prisma/client";
import { passQrSvg, svgDataUrl } from "./pass-qr";
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
  return svgDataUrl(passQrSvg(scanUrl(rawToken)));
}

/**
 * Makes sure a seated guest has a working pass: an invitation (created if
 * missing, using the event's approved template) and one active QR
 * credential. Guests whose latest RSVP is "declined" get none. Safe to call
 * repeatedly; used by every seat-assignment path.
 */
export async function ensureGuestPass(
  tx: Tx,
  eventGuestId: string
): Promise<{ credentialId: string; created: boolean } | { skipped: "declined" | "no_template" | "inactive" }> {
  const guest = await tx.eventGuest.findUniqueOrThrow({
    where: { id: eventGuestId },
    include: {
      event: true,
      person: true,
      institution: true,
      invitations: {
        where: { tokenRevokedAt: null, invitationStatus: { notIn: ["revoked", "superseded"] } },
        orderBy: { createdAt: "desc" },
        include: { rsvps: { orderBy: { submittedAt: "desc" }, take: 1 } },
      },
    },
  });
  if (guest.guestStatus !== "active") return { skipped: "inactive" };
  const latest = guest.invitations.flatMap((i) => i.rsvps).sort((a, b) => +b.submittedAt - +a.submittedAt)[0];
  if (latest?.response === "declined") return { skipped: "declined" };

  let invitationId = guest.invitations[0]?.id;
  if (!invitationId) {
    const version = await tx.invitationTemplateVersion.findFirst({
      where: { template: { eventId: guest.eventId }, status: "approved" },
      orderBy: { createdAt: "desc" },
    });
    if (!version) return { skipped: "no_template" };
    invitationId = (
      await issueInvitation(tx, {
        eventId: guest.eventId,
        eventGuestId: guest.id,
        templateVersionId: version.id,
        tokenExpiresAt: guest.event.endsAt,
        recipientEmailSnapshot: guest.person.email ?? `${guest.id}@no-email.invalid`,
        recipientNameSnapshot: [guest.person.title, guest.person.fullName].filter(Boolean).join(" "),
        designationSnapshot: guest.person.designation,
        institutionSnapshot: guest.institution?.name,
        invitationStatus: "prepared",
      })
    ).invitation.id;
  }
  const before = await tx.qrCredential.count({ where: { invitationId, status: "active" } });
  const cred = await ensureActiveCredential(tx, { invitationId, eventId: guest.eventId, expiresAt: guest.event.endsAt });
  return { credentialId: cred.id, created: before === 0 };
}

/** The pass (raw token) for a guest's active credential, or null. */
export async function activePassToken(tx: Tx, eventGuestId: string): Promise<string | null> {
  const cred = await tx.qrCredential.findFirst({
    where: { status: "active", invitation: { eventGuestId }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
  });
  return cred?.tokenEnc ? decryptSecret(cred.tokenEnc, `qr_credentials.tokenEnc:${cred.id}`) : null;
}

/** Looks up a QR credential by the raw token from a scanned URL. */
export async function findCredentialByToken(tx: Tx, rawToken: string) {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 100) return null;
  return tx.qrCredential.findUnique({ where: { credentialHash: await sha256Hex(rawToken) } });
}
