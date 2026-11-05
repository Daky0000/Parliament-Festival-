import { NextResponse } from "next/server";
import { z } from "zod";
import { withActor } from "@/lib/authz";
import { HttpError, notFound, readJson } from "@/lib/http";
import { reverseCheckin } from "@/lib/checkin";

const Body = z.object({ attendanceId: z.string().min(1), reason: z.string().trim().min(5).max(500) });

// Supervisor correction of a wrong check-in. The record is kept (reversed).
export const POST = withActor(async (request, { actor }) => {
  const body = Body.parse(await readJson(request));
  const r = await reverseCheckin(actor, body.attendanceId, body.reason);
  if (!r) throw notFound();
  if (!r.ok) throw new HttpError(409, r.message);
  return NextResponse.json({ ok: true });
});
