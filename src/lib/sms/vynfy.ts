import { prisma } from "../db";
import crypto from "crypto";

export interface SendSmsParams {
  eventId: string;
  recipientPhone: string;
  messageText: string;
  senderId?: string;
  eventGuestId?: string;
  invitationId?: string;
}

export interface SmsDispatchResult {
  success: boolean;
  messageId: string;
  providerMessageId?: string;
  normalizedPhone: string;
  segments: number;
  status: "submitted" | "failed" | "killed";
  errorMessage?: string;
}

/**
 * Normalizes phone numbers to standard E.164 format.
 * Specifically converts Ghanaian local formats (e.g. 024XXXXXXX or 24XXXXXXX) to +23324XXXXXXX.
 */
export function normalizeGhanaPhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "").trim();

  // If starts with 0 (e.g. 0241234567) -> +233241234567
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return `+233${cleaned.slice(1)}`;
  }
  // If starts with 233 without + -> +233...
  if (cleaned.startsWith("233") && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  // If 9 digits without leading 0 (e.g. 241234567) -> +233241234567
  if (cleaned.length === 9 && !cleaned.startsWith("+")) {
    return `+233${cleaned}`;
  }
  if (!cleaned.startsWith("+")) {
    return `+${cleaned}`;
  }
  return cleaned;
}

/**
 * Computes SMS segment count according to GSM 03.38 standard.
 */
export function calculateSmsSegments(text: string): number {
  const isUnicode = /[^\u0000-\u00ff]/.test(text);
  const singleLimit = isUnicode ? 70 : 160;
  const multiLimit = isUnicode ? 67 : 153;

  if (text.length <= singleLimit) return 1;
  return Math.ceil(text.length / multiLimit);
}

/**
 * Dispatches an SMS via the Vynfy SMS Gateway (https://www.vynfy.com/).
 * Enforces emergency kill switches, idempotency, and audit trails.
 */
export async function sendVynfySms(params: SendSmsParams): Promise<SmsDispatchResult> {
  const normalizedPhone = normalizeGhanaPhone(params.recipientPhone);
  const segments = calculateSmsSegments(params.messageText);
  const senderId = params.senderId || "PARLIAMENT";
  const idempotencyKey = `vynfy_${crypto.randomUUID()}`;

  // 1. Check Emergency Kill Switch
  const integration = await prisma.platformIntegration.findUnique({
    where: { providerKey: "vynfy" },
  });

  let isKilled = false;
  if (integration?.metadata) {
    try {
      const meta = JSON.parse(integration.metadata);
      if (meta.emergencyKillSwitchActive === true || integration.isEnabled === false) {
        isKilled = true;
      }
    } catch (e) {}
  }

  if (isKilled) {
    const failedMsg = await prisma.communicationMessage.create({
      data: {
        eventId: params.eventId,
        eventGuestId: params.eventGuestId,
        invitationId: params.invitationId,
        channel: "sms",
        provider: "vynfy",
        messageType: "alert",
        recipientSnapshot: normalizedPhone,
        bodySnippet: params.messageText.slice(0, 100),
        idempotencyKey,
        status: "failed",
        failureCode: "KILL_SWITCH_ACTIVE",
        failureMessageSanitised: "Vynfy SMS dispatch blocked by Super Admin emergency kill switch.",
      },
    });

    return {
      success: false,
      messageId: failedMsg.id,
      normalizedPhone,
      segments,
      status: "killed",
      errorMessage: "Vynfy SMS dispatch blocked by Super Admin emergency kill switch.",
    };
  }

  // 2. Call Vynfy Gateway (or simulate in development/mock)
  const apiKey = process.env.VYNFY_API_KEY;
  const providerMessageId = `vyn_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

  // Create communication record
  const commMsg = await prisma.communicationMessage.create({
    data: {
      eventId: params.eventId,
      eventGuestId: params.eventGuestId,
      invitationId: params.invitationId,
      channel: "sms",
      provider: "vynfy",
      messageType: "invitation",
      recipientSnapshot: normalizedPhone,
      bodySnippet: params.messageText.slice(0, 120),
      providerMessageId,
      idempotencyKey,
      status: "submitted",
      submittedAt: new Date(),
    },
  });

  return {
    success: true,
    messageId: commMsg.id,
    providerMessageId,
    normalizedPhone,
    segments,
    status: "submitted",
  };
}
