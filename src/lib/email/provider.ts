import { prisma } from "../db";
import { appEnv } from "../config";
import { getProviderSecret } from "../integrations";
import { sendViaResend, type SendResult } from "./resend";
import { openTrackingToken, openTrackingUrl, withOpenPixel } from "./tracking";

// Sends one invitation email and records the truth: an EmailAttempt row per
// try with the provider's real message id or the real error. The invitation
// becomes "sent" only when the provider accepted the message. Acceptance is
// not delivery: delivered/bounced come only from verified webhooks.

export interface SendEmailPayload {
  invitationId: string;
  campaignId?: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  fromAddress?: string;
  replyTo?: string | null;
  /** Stable per logical send (e.g. campaign recipient id) so retries never duplicate. */
  idempotencyKey: string;
}

export type EmailProvider = "resend" | "mock";

/** Mock is only possible outside production, and is the default there. */
export function activeEmailProvider(): EmailProvider {
  if (appEnv() === "production") return "resend";
  return process.env.EMAIL_PROVIDER === "resend" ? "resend" : "mock";
}

export async function sendInvitationEmail(payload: SendEmailPayload): Promise<SendResult> {
  const provider = activeEmailProvider();
  const attemptNumber = (await prisma.emailAttempt.count({ where: { invitationId: payload.invitationId } })) + 1;
  // Our own open-tracking image, tied to this invitation and attempt.
  const html = withOpenPixel(payload.htmlContent, openTrackingUrl(await openTrackingToken(payload.invitationId, attemptNumber)));

  let result: SendResult;
  if (provider === "mock") {
    // Development and CI only: nothing leaves the system.
    result = { ok: true, providerMessageId: `mock_${payload.idempotencyKey}_${attemptNumber}` };
  } else {
    const apiKey = await getProviderSecret("resend");
    const from = payload.fromAddress || process.env.RESEND_FROM_EMAIL;
    result =
      !apiKey || !from
        ? { ok: false, retryable: false, code: "not_configured", message: "Resend API key or from address is not configured." }
        : await sendViaResend(apiKey, {
            from,
            to: payload.recipientEmail,
            subject: payload.subject,
            html,
            text: payload.textContent,
            replyTo: payload.replyTo,
            idempotencyKey: payload.idempotencyKey,
            tags: { invitation: payload.invitationId, ...(payload.campaignId ? { campaign: payload.campaignId } : {}) },
          });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const attempt = await tx.emailAttempt.create({
      data: {
        invitationId: payload.invitationId,
        campaignId: payload.campaignId,
        attemptNumber,
        provider,
        providerMessageId: result.ok ? result.providerMessageId : null,
        recipientEmail: payload.recipientEmail,
        status: result.ok ? "submitted" : "failed",
        errorCode: result.ok ? null : result.code,
        errorMessage: result.ok ? null : result.message,
        submittedAt: result.ok ? now : null,
      },
    });
    await tx.invitationEvent.create({
      data: {
        invitationId: payload.invitationId,
        emailAttemptId: attempt.id,
        eventType: result.ok ? "submitted" : "failed",
        source: provider,
        metadata: JSON.stringify(result.ok ? { providerMessageId: result.providerMessageId } : { code: result.code }),
      },
    });
    await tx.invitation.update({
      where: { id: payload.invitationId },
      data: { invitationStatus: result.ok ? "sent" : result.retryable ? "queued" : "failed" },
    });
  });

  return result;
}
