import { NextResponse } from "next/server";
import { sendVynfySms } from "@/lib/sms/vynfy";
import { withActor, requireGlobal, authorizeEvent } from "@/lib/authz";

export const POST = withActor(async (request, { actor }) => {
  requireGlobal(actor, "platform.manage");
  try {
    const body = await request.json();
    const { phone, message, senderId, eventId } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { error: "Phone number and message are required" },
        { status: 400 }
      );
    }

    const event = await authorizeEvent(actor, "platform.manage", eventId);

    const result = await sendVynfySms({
      eventId: event.id,
      recipientPhone: phone,
      messageText: message,
      senderId: senderId || "PARLIAMENT",
    });

    return NextResponse.json({ data: result });
  } catch (error: any) {
    if (error?.status) throw error;
    console.error("Test SMS Error:", error);
    return NextResponse.json({ error: "SMS test failed" }, { status: 500 });
  }
});
