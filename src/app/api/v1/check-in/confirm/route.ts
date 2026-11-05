import { NextResponse } from "next/server";
import { z } from "zod";
import { withActor } from "@/lib/authz";
import { readJson } from "@/lib/http";
import { confirmCheckin } from "@/lib/checkin";

const Body = z
  .object({
    eventId: z.string().min(1),
    gateId: z.string().min(1).nullish(),
    token: z.string().min(20).max(100).optional(),
    eventGuestId: z.string().min(1).optional(),
    method: z.enum(["qr", "manual", "fast_track"]).default("qr"),
    overrideReason: z.string().trim().min(5).max(500).optional(),
  })
  .refine((b) => !!b.token !== !!b.eventGuestId, "Provide either a scanned token or a guest from lookup");

// The only way attendance is recorded. Everything is re-validated here;
// the earlier scan screen is never trusted.
export const POST = withActor(async (request, { actor }) => {
  const body = Body.parse(await readJson(request));
  const result = await confirmCheckin(actor, {
    eventId: body.eventId,
    gateId: body.gateId ?? null,
    token: body.token,
    eventGuestId: body.eventGuestId,
    method: body.method,
    override: body.overrideReason ? { reason: body.overrideReason } : undefined,
    userAgent: request.headers.get("user-agent"),
  });
  const status = result.ok ? 200 : result.state === "UNAUTHORIZED" || result.state === "WRONG_GATE" ? 403 : 409;
  return NextResponse.json({ data: result }, { status });
});
