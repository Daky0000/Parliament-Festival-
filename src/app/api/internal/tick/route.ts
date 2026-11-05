import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqualStr } from "@/lib/crypto";
import { processQueue } from "@/lib/campaigns/engine";

// Background tick, called by the Worker's Cron Trigger (worker.ts) every
// minute. Not reachable without CRON_SECRET.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !timingSafeEqualStr(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let processed = 0;
  // Bounded work per tick; the next tick continues.
  for (let i = 0; i < 8; i++) {
    const r = await processQueue(25);
    processed += r.processed;
    if (r.processed === 0) break;
  }
  return NextResponse.json({ ok: true, processed });
}
