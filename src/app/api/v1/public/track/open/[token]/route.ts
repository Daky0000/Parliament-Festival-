import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/authz";
import { keyedHash } from "@/lib/crypto";
import { PIXEL_GIF, verifyOpenTrackingToken } from "@/lib/email/tracking";

// Open-tracking image in invitation emails. Always answers with the 1x1 GIF
// (never an error image), and records an "open_signal" only for a valid,
// signed token. Repeat loads within a minute are folded into one, so mail
// clients that fetch the image twice do not double-count.
const DEDUPE_MS = 60_000;

function pixel(): Response {
  return new Response(PIXEL_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_GIF.byteLength),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const parsed = await verifyOpenTrackingToken(token);
    if (!parsed) return pixel();

    const invitation = await prisma.invitation.findUnique({ where: { id: parsed.invitationId }, select: { id: true } });
    if (!invitation) return pixel();

    const recent = await prisma.invitationEvent.findFirst({
      where: { invitationId: invitation.id, eventType: "open_signal", source: "tracking_pixel", occurredAt: { gte: new Date(Date.now() - DEDUPE_MS) } },
      select: { id: true },
    });
    if (!recent) {
      const attempt = await prisma.emailAttempt.findUnique({
        where: { invitationId_attemptNumber: { invitationId: invitation.id, attemptNumber: parsed.attemptNumber } },
        select: { id: true },
      });
      await prisma.invitationEvent.create({
        data: {
          invitationId: invitation.id,
          emailAttemptId: attempt?.id ?? null,
          eventType: "open_signal",
          source: "tracking_pixel",
          userAgent: request.headers.get("user-agent")?.slice(0, 200) || undefined,
          ipHash: await keyedHash(clientIp(request)),
          metadata: JSON.stringify({ attemptNumber: parsed.attemptNumber }),
        },
      });
    }
  } catch (err) {
    console.error("open tracking failed", err);
  }
  return pixel();
}
