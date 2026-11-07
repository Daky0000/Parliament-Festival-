import { getProviderSecret } from "../integrations";
import { activeEmailProvider } from "./provider";
import { sendViaResend } from "./resend";
import { resolveSenderAddress } from "./user-invite";

export interface PasswordResetEmailParams {
  to: string;
  fullName: string;
  resetUrl: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPasswordResetText(p: PasswordResetEmailParams): string {
  return `Parliament of Ghana - Event & Protocol Platform

Dear ${p.fullName},

We received a request to reset the password for your account. To choose a new password, open this link:
${p.resetUrl}

This link is valid for 1 hour and can only be used once.

If you did not ask for this, ignore this email. Your password stays the same.

Parliament of Ghana · Forecourt of Parliament House, Accra
`;
}

export function renderPasswordResetHtml(p: PasswordResetEmailParams): string {
  const url = escapeHtml(p.resetUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reset your password</title></head>
<body style="margin:0;padding:24px 12px;background-color:#0A1830;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#102343;border:1px solid #1E3A6E;border-radius:14px;overflow:hidden;">
      <tr><td style="background-color:#061124;padding:28px 36px;border-bottom:2px solid #C6A65B;text-align:center;">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#DFCA95;font-weight:600;">Parliament of Ghana</p>
        <h1 style="margin:8px 0 0 0;font-size:22px;font-weight:500;color:#FFFFFF;">Reset your password</h1>
      </td></tr>
      <tr><td style="padding:32px 36px 24px 36px;">
        <p style="margin:0 0 16px 0;font-size:16px;color:#FFFFFF;font-weight:500;">Dear ${escapeHtml(p.fullName)},</p>
        <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#CBD5E1;">We received a request to reset the password for your Event &amp; Protocol Platform account.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr><td align="center">
          <a href="${url}" target="_blank" style="display:inline-block;background-color:#2563EB;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:8px;">Choose a new password</a>
        </td></tr></table>
        <p style="margin:0 0 8px 0;font-size:12px;color:#DFCA95;">This link is valid for <strong>1 hour</strong> and can only be used once.</p>
        <p style="margin:0 0 8px 0;font-size:12px;color:#94A3B8;">If you did not ask for this, ignore this email. Your password stays the same.</p>
        <p style="margin:0;font-size:12px;color:#94A3B8;word-break:break-all;">If the button does not work, paste this address into your browser:<br><a href="${url}" style="color:#8FB2FF;">${url}</a></p>
      </td></tr>
      <tr><td style="padding:18px 36px 24px 36px;border-top:1px solid #1E3A6E;text-align:center;">
        <p style="margin:0;font-size:11px;color:#64748B;">Parliament of Ghana Protocol &amp; Event Directorate · Accra</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(p: PasswordResetEmailParams): Promise<{ ok: boolean; message?: string }> {
  if (activeEmailProvider() === "mock") return { ok: true };
  const apiKey = await getProviderSecret("resend");
  if (!apiKey) return { ok: false, message: "Resend API key is not configured." };
  const result = await sendViaResend(apiKey, {
    from: await resolveSenderAddress(),
    to: p.to,
    subject: "Reset your Parliament Protocol Platform password",
    html: renderPasswordResetHtml(p),
    text: renderPasswordResetText(p),
    idempotencyKey: `password_reset_${p.to}_${Date.now()}`,
    tags: { type: "password_reset" },
  });
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}
