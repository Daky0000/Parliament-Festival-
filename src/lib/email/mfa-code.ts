import { isDeployed } from "../config";
import { getProviderSecret } from "../integrations";
import { activeEmailProvider } from "./provider";
import { sendViaResend } from "./resend";
import { resolveSenderAddress } from "./user-invite";

// The two emails of the email-code fallback for two-step verification:
// the code itself, and the notice sent after it was used.

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px 12px;background-color:#0A1830;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#102343;border:1px solid #1E3A6E;border-radius:14px;overflow:hidden;">
      <tr><td style="background-color:#061124;padding:28px 36px;border-bottom:2px solid #C6A65B;text-align:center;">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#DFCA95;font-weight:600;">Parliament of Ghana</p>
        <h1 style="margin:8px 0 0 0;font-size:22px;font-weight:500;color:#FFFFFF;">${escapeHtml(title)}</h1>
      </td></tr>
      <tr><td style="padding:32px 36px 24px 36px;">${body}</td></tr>
      <tr><td style="padding:18px 36px 24px 36px;border-top:1px solid #1E3A6E;text-align:center;">
        <p style="margin:0;font-size:11px;color:#64748B;">Parliament of Ghana Protocol &amp; Event Directorate · Accra</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

export interface MfaCodeEmailParams {
  to: string;
  fullName: string;
  code: string;
}

export function renderMfaCodeText(p: MfaCodeEmailParams): string {
  return `Parliament of Ghana - Event & Protocol Platform

Dear ${p.fullName},

Your sign-in code is: ${p.code}

It is valid for 10 minutes and only works on the sign-in page where you asked for it.

If this wasn't you, someone knows your password: change it.
`;
}

export function renderMfaCodeHtml(p: MfaCodeEmailParams): string {
  return shell(
    "Your sign-in code",
    `<p style="margin:0 0 16px 0;font-size:16px;color:#FFFFFF;font-weight:500;">Dear ${escapeHtml(p.fullName)},</p>
        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#CBD5E1;">Enter this code on the two-step verification page:</p>
        <p style="margin:0 0 24px 0;text-align:center;font-size:34px;letter-spacing:0.3em;font-weight:600;color:#FFFFFF;">${escapeHtml(p.code)}</p>
        <p style="margin:0 0 8px 0;font-size:12px;color:#DFCA95;">Valid for <strong>10 minutes</strong>, and only on the sign-in page where you asked for it.</p>
        <p style="margin:0;font-size:12px;color:#94A3B8;">If this wasn't you, someone knows your password: change it.</p>`
  );
}

export interface MfaNoticeEmailParams {
  to: string;
  fullName: string;
  when: Date;
  userAgent: string | null;
}

function noticeLines(p: MfaNoticeEmailParams) {
  const when = p.when.toUTCString();
  const browser = (p.userAgent || "Unknown browser").slice(0, 160);
  return { when, browser };
}

export function renderMfaNoticeText(p: MfaNoticeEmailParams): string {
  const { when, browser } = noticeLines(p);
  return `Parliament of Ghana - Event & Protocol Platform

Dear ${p.fullName},

You signed in with an email code instead of your authenticator app.

Time: ${when}
Browser: ${browser}

If this wasn't you, change your password now and ask a super admin to sign out your sessions.
`;
}

export function renderMfaNoticeHtml(p: MfaNoticeEmailParams): string {
  const { when, browser } = noticeLines(p);
  return shell(
    "Signed in with an email code",
    `<p style="margin:0 0 16px 0;font-size:16px;color:#FFFFFF;font-weight:500;">Dear ${escapeHtml(p.fullName)},</p>
        <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#CBD5E1;">You signed in with an email code instead of your authenticator app.</p>
        <p style="margin:0 0 4px 0;font-size:13px;color:#CBD5E1;">Time: ${escapeHtml(when)}</p>
        <p style="margin:0 0 20px 0;font-size:13px;color:#CBD5E1;word-break:break-all;">Browser: ${escapeHtml(browser)}</p>
        <p style="margin:0;font-size:12px;color:#94A3B8;">If this wasn't you, change your password now and ask a super admin to sign out your sessions.</p>`
  );
}

type Result = { ok: boolean; message?: string };

async function send(to: string, subject: string, html: string, text: string, idempotencyKey: string, type: string, devLog?: string): Promise<Result> {
  if (activeEmailProvider() === "mock") {
    // A deployed site with the mock provider would "send" codes nobody receives.
    if (isDeployed()) return { ok: false, message: "Email sending is not configured." };
    if (devLog) console.info(devLog);
    return { ok: true };
  }
  const apiKey = await getProviderSecret("resend");
  if (!apiKey) return { ok: false, message: "Resend API key is not configured." };
  const result = await sendViaResend(apiKey, {
    from: await resolveSenderAddress(),
    to,
    subject,
    html,
    text,
    idempotencyKey,
    tags: { type },
  });
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

/** idempotencyKey must never contain the code. */
export function sendMfaCodeEmail(p: MfaCodeEmailParams, idempotencyKey: string): Promise<Result> {
  return send(p.to, "Your sign-in code", renderMfaCodeHtml(p), renderMfaCodeText(p), idempotencyKey, "mfa_email_code",
    `[mock email] sign-in code for ${p.to}: ${p.code}`);
}

export function sendMfaNoticeEmail(p: MfaNoticeEmailParams, idempotencyKey: string): Promise<Result> {
  return send(p.to, "You signed in with an email code", renderMfaNoticeHtml(p), renderMfaNoticeText(p), idempotencyKey, "mfa_email_notice");
}
