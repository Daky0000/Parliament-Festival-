import { prisma } from "../db";
import { appEnv } from "../config";
import { getProviderSecret, sanitizeMetadata } from "../integrations";

// Vynfy SMS adapter.
//
// Implemented strictly from Vynfy's published developer page
// (https://www.vynfy.com/developers): POST https://sms.vynfy.com/api/v1/send,
// header X-API-Key, JSON { sender, recipients: ["233XXXXXXXXX"], message }.
// The page does not document the response body, error format, message ids or
// delivery-receipt webhooks, so this adapter does NOT invent them:
// - 2xx  -> "submitted" (accepted by Vynfy); the raw response is stored for
//           reconciliation and no provider message id is fabricated;
// - else -> "failed" with the HTTP status; 429/5xx/network are retryable.
// Delivery status stays "submitted" until Vynfy documents receipts.

export const VYNFY_SEND_URL = "https://sms.vynfy.com/api/v1/send";

export interface SendSmsParams {
  eventId: string;
  recipientPhone: string;
  messageText: string;
  senderId?: string;
  eventGuestId?: string;
  invitationId?: string;
  /** Stable per logical send; a repeat with the same key returns the earlier result. */
  idempotencyKey?: string;
  messageType?: string;
}

export interface SmsDispatchResult {
  success: boolean;
  messageId: string;
  normalizedPhone: string | null;
  segments: number;
  status: "submitted" | "failed" | "killed" | "invalid_number" | "duplicate";
  retryable?: boolean;
  errorMessage?: string;
}

export { normalizeGhanaPhone, calculateSmsSegments } from "./format";
import { normalizeGhanaPhone, calculateSmsSegments } from "./format";

/** Global kill switch. Fails closed: missing, disabled or killed => blocked. */
export async function smsBlockedReason(): Promise<string | null> {
  const integration = await prisma.platformIntegration.findUnique({ where: { providerKey: "vynfy" } });
  if (!integration) return "Vynfy integration is not configured.";
  if (!integration.isEnabled) return "SMS sending is disabled.";
  if (sanitizeMetadata(integration.metadata).emergencyKillSwitchActive === true) {
    return "SMS sending is blocked by the emergency kill switch.";
  }
  return null;
}

function mockSmsMode(): boolean {
  return appEnv() !== "production" && process.env.SMS_PROVIDER !== "vynfy";
}

export async function sendVynfySms(params: SendSmsParams): Promise<SmsDispatchResult> {
  const normalizedPhone = normalizeGhanaPhone(params.recipientPhone);
  const segments = calculateSmsSegments(params.messageText);
  const idempotencyKey = params.idempotencyKey ?? `sms_${crypto.randomUUID()}`;
  const base = {
    eventId: params.eventId,
    eventGuestId: params.eventGuestId,
    invitationId: params.invitationId,
    channel: "sms",
    provider: "vynfy",
    messageType: params.messageType ?? "invitation",
    bodySnippet: params.messageText.slice(0, 120),
    idempotencyKey,
  };

  const previous = await prisma.communicationMessage.findUnique({ where: { idempotencyKey } });
  if (previous && previous.status !== "failed") {
    return { success: previous.status === "submitted", messageId: previous.id, normalizedPhone, segments, status: "duplicate" };
  }

  const fail = async (status: SmsDispatchResult["status"], code: string, message: string, retryable = false, raw?: string) => {
    const data = {
      ...base,
      recipientSnapshot: normalizedPhone ?? params.recipientPhone.slice(0, 32),
      status: "failed",
      failedAt: new Date(),
      failureCode: code,
      failureMessageSanitised: message,
      providerResponse: raw ?? null,
    };
    const row = previous
      ? await prisma.communicationMessage.update({ where: { id: previous.id }, data })
      : await prisma.communicationMessage.create({ data });
    return { success: false, messageId: row.id, normalizedPhone, segments, status, retryable, errorMessage: message };
  };

  if (!normalizedPhone) return fail("invalid_number", "INVALID_NUMBER", "Not a valid Ghana phone number.");

  const blocked = await smsBlockedReason();
  if (blocked) return fail("killed", "KILL_SWITCH_ACTIVE", blocked);

  const suppressed = await prisma.suppression.findUnique({ where: { channel_address: { channel: "sms", address: normalizedPhone } } });
  if (suppressed) return fail("failed", "SUPPRESSED", "This number has opted out or is suppressed.");

  const sender = (params.senderId || process.env.VYNFY_SENDER_ID || "").trim();
  let raw: string;
  if (mockSmsMode()) {
    raw = JSON.stringify({ mock: true });
  } else {
    const apiKey = await getProviderSecret("vynfy");
    if (!apiKey || !sender) return fail("failed", "NOT_CONFIGURED", "Vynfy API key or sender ID is not configured.");
    let res: Response;
    try {
      res = await fetch(VYNFY_SEND_URL, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ sender, recipients: [normalizedPhone.slice(1)], message: params.messageText }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      return fail("failed", "NETWORK_ERROR", String((err as Error).message).slice(0, 200), true);
    }
    raw = (await res.text()).slice(0, 2000);
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      return fail("failed", `HTTP_${res.status}`, `Vynfy rejected the message (HTTP ${res.status}).`, retryable, raw);
    }
  }

  const data = {
    ...base,
    recipientSnapshot: normalizedPhone,
    status: "submitted",
    submittedAt: new Date(),
    providerMessageId: null,
    providerResponse: raw,
    failureCode: null,
    failureMessageSanitised: null,
  };
  const row = previous
    ? await prisma.communicationMessage.update({ where: { id: previous.id }, data })
    : await prisma.communicationMessage.create({ data });
  return { success: true, messageId: row.id, normalizedPhone, segments, status: "submitted" };
}
