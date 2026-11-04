import { NextRequest, NextResponse } from "next/server";
import { processIncomingWebhook } from "@/lib/email/provider";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();

    // Support both standardized webhook payloads and simulated sandbox posts
    const {
      provider = "mock",
      providerEventId,
      providerMessageId,
      eventType,
      recipientEmail,
    } = rawBody;

    if (!providerEventId || !eventType) {
      return NextResponse.json(
        { error: "providerEventId and eventType are required" },
        { status: 400 }
      );
    }

    const result = await processIncomingWebhook({
      provider,
      providerEventId,
      providerMessageId,
      eventType,
      recipientEmail,
      rawPayload: rawBody,
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

