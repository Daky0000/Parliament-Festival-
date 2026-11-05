import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "svix";
import { getProviderSecret } from "@/lib/integrations";
import { processResendEvent, type ResendEvent } from "@/lib/email/webhooks";

// Resend delivery webhooks (sent via Svix). The signature is verified on the
// raw body with Resend's signing secret before anything is stored; unsigned
// or forged requests are rejected with 401.
export async function POST(request: NextRequest) {
  const secret = await getProviderSecret("resend", "webhookSecret");
  if (!secret) {
    return NextResponse.json({ error: "Webhook receiver is not configured" }, { status: 503 });
  }

  const payload = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let event: ResendEvent;
  try {
    // svix 2.x: verify() throws on a bad signature or stale timestamp and
    // returns nothing; parse the raw body only after it passes.
    new Webhook(secret).verify(payload, headers);
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const outcome = await processResendEvent(headers["svix-id"], event);
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    console.error("Resend webhook processing failed", err);
    // 500 makes Svix retry later; processing is idempotent.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
