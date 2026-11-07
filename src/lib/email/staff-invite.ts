import { activeEmailProvider } from "./provider";
import { getProviderSecret } from "../integrations";
import { sendViaResend } from "./resend";
import { withPoweredBy, withPoweredByText } from "./powered-by";
import { appBaseUrl } from "../app-url";

// Emails a new staff member their account activation link. Same provider
// rules as invitations: Resend in production, a mock (nothing sent)
// elsewhere unless EMAIL_PROVIDER=resend.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function staffInviteEmail(v: { fullName: string; roleName: string; eventName: string | null; activationUrl: string; invitedBy: string | null }) {
  const subject = "Your account on the Parliament of Ghana Event & Protocol Platform";
  const scope = v.eventName ? ` for ${v.eventName}` : "";
  const by = v.invitedBy ? `${v.invitedBy} has` : "You have been";
  const intro = `${v.invitedBy ? `${by} invited you` : "You have been invited"} to join the Parliament of Ghana Event & Protocol Platform as ${v.roleName}${scope}.`;
  const mark = `${appBaseUrl()}/assets/email/mark-navy.png`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ECEEF1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ECEEF1;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;font-family:'Outfit','Segoe UI',Helvetica,Arial,sans-serif;color:#0D1526;">
<tr><td style="background:#FFFFFF;border-radius:22px;padding:34px 36px;" bgcolor="#FFFFFF">
  <img src="${mark}" width="44" height="44" alt="" style="display:block;border:0;width:44px;height:44px;">
  <p style="margin:20px 0 0 0;font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#5B6374;">Parliament of Ghana · Event &amp; Protocol Platform</p>
  <h1 style="margin:10px 0 0 0;font-size:28px;line-height:1.15;font-weight:400;letter-spacing:-.03em;color:#0D1526;">Welcome, ${esc(v.fullName)}</h1>
  <p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#5B6374;">${esc(intro)}</p>
  <p style="margin:12px 0 0 0;font-size:16px;line-height:1.6;color:#5B6374;">Set your password to activate your account. The link works once and expires in 72 hours.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;"><tr>
    <td bgcolor="#2563EB" style="border-radius:10px;background:#2563EB;">
      <a href="${v.activationUrl}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:500;color:#FFFFFF;text-decoration:none;border-radius:10px;">Activate my account &nbsp;&rarr;</a>
    </td></tr></table>
  <p style="margin:26px 0 0 0;font-size:13.5px;line-height:1.55;color:#5B6374;background:#F6F7F9;border-radius:14px;padding:14px 16px;">If the button does not work, copy this link into your browser:<br><a href="${v.activationUrl}" style="color:#2563EB;text-decoration:none;word-break:break-all;">${v.activationUrl}</a></p>
  <p style="margin:18px 0 0 0;font-size:13px;line-height:1.55;color:#8A91A0;">If you were not expecting this, you can ignore this email; no account is activated until the link is used.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  const text = `Welcome, ${v.fullName}

${intro}

Set your password to activate your account (works once, expires in 72 hours):
${v.activationUrl}

If you were not expecting this, you can ignore this email.`;
  return { subject, html: withPoweredBy(html), text: withPoweredByText(text) };
}

export type StaffInviteResult = { sent: boolean; provider: "resend" | "mock"; error?: string };

export async function sendStaffInviteEmail(
  to: string,
  v: Parameters<typeof staffInviteEmail>[0],
  idempotencyKey: string
): Promise<StaffInviteResult> {
  const { subject, html, text } = staffInviteEmail(v);
  const provider = activeEmailProvider();
  if (provider === "mock") return { sent: true, provider };
  const apiKey = await getProviderSecret("resend");
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, provider, error: "Email is not configured (Resend API key or from address missing)." };
  const r = await sendViaResend(apiKey, { from, to, subject, html, text, idempotencyKey, tags: { kind: "staff_invite" } });
  return r.ok ? { sent: true, provider } : { sent: false, provider, error: r.message };
}
