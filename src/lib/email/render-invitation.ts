// Builds the placeholder values for the invitation email. No database access,
// so it runs both in the campaign dispatch route and in the browser (the
// Template Studio preview) and both show exactly the same email.
import { rankTheme } from "./rank-theme";

export type InvitationGuest = {
  title?: string | null;
  fullName: string;
  designation?: string | null;
  institution?: string | null;
  rankColourHex?: string | null;
  rankName?: string | null;
  rankOrder?: number | null;
};

export type InvitationContext = {
  eventName: string;
  venueName?: string | null;
  rsvpUrl: string;
  reference: string;
};

export function buildInvitationVars(guest: InvitationGuest, ctx: InvitationContext): Record<string, string> {
  const title = guest.title?.trim() || "";
  // Skip the title when the stored full name already starts with it ("Rt. Hon. Rt. Hon. ...")
  const showTitle = title && !guest.fullName.toLowerCase().startsWith(title.toLowerCase());

  return {
    "event.name": ctx.eventName,
    "event.venue_name": ctx.venueName || "Parliament House",
    "guest.title": showTitle ? title : "",
    "guest.full_name": guest.fullName,
    "guest.designation": guest.designation || "",
    "guest.institution_name": guest.institution || "",
    // "Designation · Institution", skipping whichever is missing
    "guest.affiliation": [guest.designation, guest.institution].filter((s) => s && s.trim()).join(" · "),
    "invitation.rsvp_url": ctx.rsvpUrl,
    "invitation.reference": ctx.reference,
    // Header band colours follow the protocol rank; navy when the guest has none
    ...rankTheme(guest.rankColourHex, guest.rankName, guest.rankOrder),
  };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Replaces {{key}} placeholders. For HTML, values are escaped. */
export function fillTemplate(template: string, vars: Record<string, string>, opts: { html: boolean }): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (m, key: string) =>
    key in vars ? (opts.html ? escapeHtml(vars[key] ?? "") : vars[key] ?? "") : m
  );
}
