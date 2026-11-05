import { NextResponse } from "next/server";
import { z } from "zod";
import { withActor } from "@/lib/authz";
import { readJson } from "@/lib/http";
import { verifyGuest, verifyScan } from "@/lib/checkin";

const Body = z.union([
  z.object({ token: z.string().min(1).max(200), gateId: z.string().min(1).nullish() }),
  z.object({ eventId: z.string().min(1), eventGuestId: z.string().min(1), gateId: z.string().min(1).nullish() }),
]);

// Verifies a scanned pass, or a guest found by reference, for the usher
// dashboard. Read-only: nothing is recorded until the usher confirms. POST
// keeps the pass token out of URLs and access logs.
export const POST = withActor(async (request, { actor }) => {
  const body = Body.parse(await readJson(request));
  const data =
    "token" in body
      ? await verifyScan(actor, body.token, body.gateId ?? null)
      : await verifyGuest(actor, body.eventId, body.eventGuestId, body.gateId ?? null);
  return NextResponse.json({ data });
});
