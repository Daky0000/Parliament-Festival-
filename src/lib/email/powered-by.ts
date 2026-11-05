import { appBaseUrl } from "../app-url";
import { DAKYX_NAME, DAKYX_PHONE, DAKYX_PHONE_TEL, DAKYX_URL } from "../brand/dakyx";

// "Powered by DakyXTech" footer added to every email the platform sends,
// with DakyXTech linking to dakyx.com and the phone number under it.
// Email-safe: a table, inline styles and a hosted image (no data URI).

export function poweredByFooterHtml(): string {
  const mark = `${appBaseUrl()}/assets/brand/dakyx-mark.png`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:20px 16px 28px 16px;font-family:'Outfit','Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#5B6374;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
        <tr>
          <td style="vertical-align:middle;padding-right:6px;"><a href="${DAKYX_URL}" style="text-decoration:none;"><img src="${mark}" width="16" height="16" alt="" style="display:block;border:0;width:16px;height:16px;"></a></td>
          <td style="vertical-align:middle;font-size:12.5px;color:#5B6374;">Powered by <a href="${DAKYX_URL}" style="color:#2563EB;font-weight:600;text-decoration:none;">${DAKYX_NAME}</a></td>
        </tr>
      </table>
      <a href="tel:${DAKYX_PHONE_TEL}" style="color:#5B6374;text-decoration:none;">${DAKYX_PHONE}</a>
    </td>
  </tr>
</table>`;
}

export function poweredByFooterText(): string {
  return `\n\n--\nPowered by ${DAKYX_NAME} (${DAKYX_URL})\n${DAKYX_PHONE}`;
}

/** Adds the footer just before </body>, or at the end. Never added twice. */
export function withPoweredBy(html: string): string {
  if (html.includes("data-powered-by-dakyx")) return html;
  const block = `<div data-powered-by-dakyx="1">${poweredByFooterHtml()}</div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${block}</body>`) : html + block;
}

export function withPoweredByText(text: string): string {
  return text.includes(DAKYX_URL) ? text : text + poweredByFooterText();
}
