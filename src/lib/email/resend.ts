// Resend adapter. Contract from the official docs (POST /emails, Bearer
// auth, Idempotency-Key header, success body { id }). A message is only
// "accepted" when Resend returns 2xx with an id; everything else is a failure
// classified as retryable (network, 408, 409 idempotency race, 429, 5xx) or
// permanent (other 4xx).

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; code: string; message: string };

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  idempotencyKey: string;
  tags?: Record<string, string>;
};

const RETRYABLE_STATUS = new Set([408, 409, 429]);

export async function sendViaResend(apiKey: string, msg: EmailMessage, timeoutMs = 10_000): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": msg.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: msg.from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
        ...(msg.tags
          ? {
              tags: Object.entries(msg.tags).map(([name, value]) => ({
                name,
                value: value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, retryable: true, code: "network_error", message: String((err as Error).message).slice(0, 200) };
  }

  const text = await res.text();
  let body: { id?: string; message?: string; name?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }

  if (res.ok && typeof body.id === "string" && body.id) {
    return { ok: true, providerMessageId: body.id };
  }
  const retryable = res.status >= 500 || RETRYABLE_STATUS.has(res.status) || res.ok;
  return {
    ok: false,
    retryable,
    code: res.ok ? "missing_message_id" : `http_${res.status}${body.name ? `_${body.name}` : ""}`,
    message: (body.message || text || `HTTP ${res.status}`).slice(0, 300),
  };
}
