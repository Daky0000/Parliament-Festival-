import { getProviderSecret } from "../integrations";
import { activeEmailProvider } from "./provider";
import { sendViaResend } from "./resend";
import { prisma } from "../db";

export interface SendUserInviteEmailParams {
  to: string;
  fullName: string;
  roleName: string;
  eventName?: string | null;
  activationUrl: string;
  inviterName?: string;
}

export interface UserInviteEmailResult {
  ok: boolean;
  providerMessageId?: string;
  message?: string;
  code?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderUserInviteText(params: SendUserInviteEmailParams): string {
  return `Parliament of Ghana - Event & Protocol Platform
Office of the Rt. Hon. Speaker & Protocol Directorate

Dear ${params.fullName},

You have been invited by ${params.inviterName || "an administrator"} to access the Parliament of Ghana Event & Protocol Platform.

Role: ${params.roleName}
Assigned Scope: ${params.eventName || "All events"}

To set up your account password and activate your access, please open the following link in your browser:
${params.activationUrl}

Note: This activation link is valid for 72 hours and can only be used once.

If you were not expecting this invitation, please disregard this email or contact the Protocol Directorate.

Parliament of Ghana · Forecourt of Parliament House, Accra
`;
}

export function renderUserInviteHtml(params: SendUserInviteEmailParams): string {
  const scopeText = params.eventName ? params.eventName : "All Parliamentary Events";
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Platform Account Invitation</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0A1830; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .btn:hover { background-color: #1D4ED8 !important; }
  </style>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #0A1830; color: #FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background-color: #102343; border: 1px solid #1E3A6E; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #061124; padding: 32px 36px; border-bottom: 2px solid #C6A65B; text-align: center;">
              <p style="margin: 0; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #DFCA95; font-weight: 600;">
                Parliament of Ghana
              </p>
              <h1 style="margin: 8px 0 0 0; font-size: 22px; font-weight: 500; color: #FFFFFF; letter-spacing: -0.02em;">
                Event &amp; Protocol Directorate
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 12px; color: #8FB2FF;">
                Official Platform Access Invitation
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #FFFFFF; font-weight: 500;">
                Dear ${escapeHtml(params.fullName)},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #CBD5E1;">
                You have been invited by <strong>${escapeHtml(params.inviterName || "an administrator")}</strong> to access the <strong>Parliament of Ghana Event &amp; Protocol Platform</strong>.
              </p>

              <!-- Assignment Details Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0A1830; border: 1px solid #1E3A6E; border-radius: 10px; margin-bottom: 26px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding: 4px 0; font-size: 12px; color: #8FB2FF; width: 120px;">Assigned Role:</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #FFFFFF; font-weight: 600;">${escapeHtml(params.roleName)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 12px; color: #8FB2FF;">Scope / Event:</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #FFFFFF; font-weight: 500;">${escapeHtml(scopeText)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #CBD5E1;">
                Please set up your account password to activate your credentials and sign in to the platform.
              </p>

              <!-- Call to Action Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="${params.activationUrl}" target="_blank" class="btn" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 13px 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37,99,235,0.35);">
                      Activate Your Account
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry & Fallback Notice -->
              <div style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px 16px; margin-bottom: 12px;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #DFCA95;">
                  &bull; This activation link is valid for <strong>72 hours</strong> and can only be used once.
                </p>
                <p style="margin: 0; font-size: 12px; color: #94A3B8; word-break: break-all; line-height: 1.5;">
                  If the button above does not work, copy and paste this address into your browser:<br>
                  <a href="${params.activationUrl}" style="color: #8FB2FF; text-decoration: underline;">${params.activationUrl}</a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px 28px 36px; border-top: 1px solid #1E3A6E; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #64748B; line-height: 1.5;">
                Confidential &bull; Parliament of Ghana Protocol &amp; Event Directorate<br>
                Forecourt of Parliament House, Accra, Ghana
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function resolveSenderAddress(): Promise<string> {
  if (process.env.RESEND_FROM_EMAIL) {
    return process.env.RESEND_FROM_EMAIL;
  }
  try {
    const integration = await prisma.platformIntegration.findUnique({
      where: { providerKey: "resend" },
    });
    if (integration?.metadata) {
      const meta = typeof integration.metadata === "string" ? JSON.parse(integration.metadata) : integration.metadata;
      if (meta.fromEmail) return meta.fromEmail;
      if (meta.senderEmail) {
        return meta.senderName ? `${meta.senderName} <${meta.senderEmail}>` : meta.senderEmail;
      }
    }
  } catch {
    // Fallback if DB lookup fails
  }
  return "Parliament Protocol <invitations@marketing.dakyworld.com>";
}

export async function sendUserInviteEmail(params: SendUserInviteEmailParams): Promise<UserInviteEmailResult> {
  const provider = activeEmailProvider();

  if (provider === "mock") {
    return { ok: true, providerMessageId: `mock_user_invite_${Date.now()}` };
  }

  const apiKey = await getProviderSecret("resend");
  if (!apiKey) {
    return {
      ok: false,
      code: "not_configured",
      message: "Resend API key is not configured in environment or database credentials.",
    };
  }

  const from = await resolveSenderAddress();
  const subject = "Invitation to join Parliament of Ghana Protocol Platform";
  const html = renderUserInviteHtml(params);
  const text = renderUserInviteText(params);

  const result = await sendViaResend(apiKey, {
    from,
    to: params.to,
    subject,
    html,
    text,
    idempotencyKey: `user_invite_${params.to}_${Date.now()}`,
    tags: { type: "user_invite" },
  });

  if (result.ok) {
    return { ok: true, providerMessageId: result.providerMessageId };
  }

  return {
    ok: false,
    code: result.code,
    message: result.message,
  };
}
