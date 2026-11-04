import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendVynfySms } from "@/lib/sms/vynfy";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, message, senderId } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { error: "Phone number and message are required" },
        { status: 400 }
      );
    }

    const event = await prisma.event.findFirst({
      where: { eventCode: "CAROLS-2026" },
    });

    if (!event) {
      return NextResponse.json({ error: "Active event not found" }, { status: 404 });
    }

    const result = await sendVynfySms({
      eventId: event.id,
      recipientPhone: phone,
      messageText: message,
      senderId: senderId || "PARLIAMENT",
    });

    return NextResponse.json({ data: result });
  } catch (error: any) {
    console.error("Test SMS Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
