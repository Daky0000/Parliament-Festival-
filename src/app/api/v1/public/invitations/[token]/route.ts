import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sha256Hex, keyedHash } from "@/lib/crypto";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/authz";
import { attemptKey, assertNotThrottled, recordAttempt } from "@/lib/auth";
import { ensureActiveCredential, passQrDataUrl, revokeCredentials, withUniqueReference } from "@/lib/guest-tokens";
import { decryptSecret } from "@/lib/crypto";

// Guest-facing invitation API. GET is strictly read-only (email scanners and
// link previews fetch it); views are recorded only by the page's own script.

const GENERIC = "This invitation link is not valid. Please contact the event office.";
const CLOSED_EVENT_STATUSES = new Set(["cancelled", "archived"]);

async function loadInvitation(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: await sha256Hex(token) },
    include: {
      event: true,
      eventGuest: { include: { person: true, protocolCategory: true } },
      rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
    },
  });
  if (!inv) return null;
  if (inv.tokenRevokedAt) return null;
  if (inv.tokenExpiresAt && inv.tokenExpiresAt < new Date()) return null;
  if (inv.invitationStatus === "revoked" || inv.invitationStatus === "superseded") return null;
  return inv;
}

async function activePassQr(invitationId: string): Promise<string | null> {
  const cred = await prisma.qrCredential.findFirst({ where: { invitationId, status: "active" } });
  if (!cred?.tokenEnc || (cred.expiresAt && cred.expiresAt < new Date())) return null;
  return passQrDataUrl(await decryptSecret(cred.tokenEnc, `qr_credentials.tokenEnc:${cred.id}`));
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const inv = await loadInvitation(token);
    if (!inv) throw new HttpError(404, GENERIC);
    const latest = inv.rsvps[0];
    const deadlinePassed = !!inv.event.rsvpDeadline && inv.event.rsvpDeadline < new Date();

    return NextResponse.json(
      {
        data: {
          invitationReference: inv.invitationReference,
          eventName: inv.event.name,
          eventVenue: inv.event.venueName,
          eventAddress: inv.event.venueAddress,
          eventStartsAt: inv.event.startsAt,
          rsvpDeadline: inv.event.rsvpDeadline,
          acceptingResponses: !deadlinePassed && !CLOSED_EVENT_STATUSES.has(inv.event.status),
          guestTitle: inv.eventGuest.person.title,
          guestFullName: inv.recipientNameSnapshot,
          designation: inv.designationSnapshot,
          institution: inv.institutionSnapshot,
          protocolCategory: inv.eventGuest.protocolCategory?.name,
          companionAllowance: inv.eventGuest.companionAllowance,
          currentRsvp: latest
            ? {
                response: latest.response,
                companionCount: latest.companionCount,
                confirmationReference: latest.confirmationReference,
                submittedAt: latest.submittedAt,
              }
            : null,
          qrCodeDataUrl: latest?.response === "accepted" ? await activePassQr(inv.id) : null,
        },
      },
      { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("view") }),
  z.object({
    action: z.literal("rsvp"),
    response: z.enum(["accepted", "declined"]),
    companionCount: z.number().int().min(0).max(20).default(0),
    notes: z.string().trim().max(1000).optional(),
  }),
]);

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(req);
    const { token } = await context.params;
    const raw = (await readJson(req)) as Record<string, unknown>;
    // Older clients posted the RSVP without an action field.
    const body = Body.parse(raw && !raw.action ? { ...raw, action: "rsvp" } : raw);

    const inv = await loadInvitation(token);
    if (!inv) throw new HttpError(404, GENERIC);
    const tokenKey = await attemptKey(body.action === "view" ? "public_view" : "rsvp", inv.id);
    await assertNotThrottled(tokenKey, body.action === "view" ? "public_view" : "rsvp");
    await recordAttempt(tokenKey, body.action === "view" ? "public_view" : "rsvp", false);

    if (body.action === "view") {
      await prisma.invitationEvent.create({
        data: {
          invitationId: inv.id,
          eventType: "link_access",
          source: "page_script",
          userAgent: req.headers.get("user-agent")?.slice(0, 200) || undefined,
          ipHash: await keyedHash(clientIp(req)),
        },
      });
      return NextResponse.json({ ok: true });
    }

    if (CLOSED_EVENT_STATUSES.has(inv.event.status)) {
      throw new HttpError(410, "This event is no longer accepting responses.");
    }
    if (inv.event.rsvpDeadline && inv.event.rsvpDeadline < new Date()) {
      throw new HttpError(409, "The RSVP deadline has passed. Please contact the event office.");
    }
    const companions = body.response === "accepted" ? body.companionCount : 0;
    if (companions > inv.eventGuest.companionAllowance) {
      throw new HttpError(400, `You may bring up to ${inv.eventGuest.companionAllowance} companion(s).`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const previous = await tx.rsvp.findFirst({ where: { invitationId: inv.id }, orderBy: { submittedAt: "desc" } });
      const rsvp = await withUniqueReference("CONF", (confirmationReference) =>
        tx.rsvp.create({
          data: {
            invitationId: inv.id,
            response: body.response,
            companionCount: companions,
            submittedVia: "invitation_page",
            confirmationReference,
            notes: body.notes,
            supersedesRsvpId: previous?.id,
          },
        })
      );
      let passToken: string | null = null;
      if (body.response === "accepted") {
        passToken = (await ensureActiveCredential(tx, { invitationId: inv.id, eventId: inv.eventId, expiresAt: inv.event.endsAt }))
          .rawToken;
      } else {
        await revokeCredentials(tx, inv.id);
      }
      await tx.auditLog.create({
        data: {
          organizationId: inv.event.organizationId,
          eventId: inv.eventId,
          actorType: "integration",
          action: previous ? "rsvp.changed" : "rsvp.submitted",
          entityType: "invitation",
          entityId: inv.id,
          beforeData: previous ? JSON.stringify({ response: previous.response, companionCount: previous.companionCount }) : null,
          afterData: JSON.stringify({ response: body.response, companionCount: companions }),
        },
      });
      return { rsvp, passToken };
    });

    return NextResponse.json({
      data: {
        confirmationReference: result.rsvp.confirmationReference,
        response: result.rsvp.response,
        companionCount: result.rsvp.companionCount,
        submittedAt: result.rsvp.submittedAt,
        qrCodeDataUrl: result.passToken ? await passQrDataUrl(result.passToken) : null,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
