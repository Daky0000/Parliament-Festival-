import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const body = await request.json();
  const { recipientEmail } = body;

  if (!recipientEmail) {
    return NextResponse.json({ error: "recipientEmail is required" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not configured in environment." },
      { status: 500 }
    );
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "Parliament Protocol <onboarding@resend.dev>";
  const startTime = Date.now();

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail],
        subject: "Parliament of Ghana - Official System Verification Test",
        html: `
          <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0A1830; color: #FFFFFF; padding: 32px; border: 2px solid #C6A65B; border-radius: 8px;">
            <div style="text-align: center; border-bottom: 1px solid #C6A65B; padding-bottom: 20px; margin-bottom: 24px;">
              <h1 style="color: #DFCA95; font-size: 20px; margin: 0; text-transform: uppercase; letter-spacing: 2px;">Parliament of Ghana</h1>
              <p style="color: #C6A65B; font-size: 13px; margin: 6px 0 0 0;">Office of the Rt. Hon. Speaker & Protocol Directorate</p>
            </div>
            <p style="font-size: 15px; line-height: 1.6; color: #E0E7FF;">
              This is an official verification test dispatch from the <strong>Parliament Event & Protocol Management Platform (V3.0)</strong> for the <em>2026 Festival of Nine Lessons and Carols</em>.
            </p>
            <div style="background: #102343; border-left: 4px solid #C6A65B; padding: 16px; margin: 24px 0; border-radius: 0 4px 4px 0;">
              <p style="margin: 0; font-size: 12px; color: #DFCA95;">Gateway Provider: <strong>Resend Production API</strong></p>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #DFCA95;">Verified Domain: <strong>marketing.dakyworld.com / parliament.gh</strong></p>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #DFCA95;">Timestamp: <strong>${new Date().toISOString()}</strong></p>
            </div>
            <p style="font-size: 12px; color: #94A3B8; text-align: center; margin-top: 32px; border-top: 1px solid #1E293B; padding-top: 16px;">
              Confidential State Event System &bull; Forecourt of Parliament, Accra, Ghana
            </p>
          </div>
        `,
        text: `Parliament of Ghana - Protocol System Test Verification. Generated at ${new Date().toISOString()}`,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      return NextResponse.json(
        {
          error: `Resend API returned [HTTP ${resendResponse.status}]: ${errText}`,
          latencyMs,
        },
        { status: resendResponse.status }
      );
    }

    const resendData = await resendResponse.json();

    // Log the successful attempt to database
    const dummyInvitation = await prisma.invitation.findFirst();
    if (dummyInvitation) {
      await prisma.emailAttempt.create({
        data: {
          invitationId: dummyInvitation.id,
          attemptNumber: 1,
          provider: "resend",
          providerMessageId: resendData.id,
          recipientEmail,
          status: "delivered",
          submittedAt: new Date(),
          deliveredAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      data: {
        status: "DELIVERED",
        providerMessageId: resendData.id,
        recipient: recipientEmail,
        latencyMs,
        timestamp: new Date().toLocaleTimeString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to dispatch test email" },
      { status: 500 }
    );
  }
}

