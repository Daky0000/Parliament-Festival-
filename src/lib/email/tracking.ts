import { appOrigin } from "../config";
import { keyedHash, timingSafeEqualStr } from "../crypto";

// First-party open tracking. Every invitation email carries a 1x1 image whose
// URL names the invitation and attempt number plus an HMAC, so the receiver
// can attribute an open to exactly one dignitary without a database lookup
// table and nobody can forge opens for other guests. It works with or without
// Resend's own open tracking, which is often off on a sending domain.
//
// An image load is a signal, not proof of reading: Apple Mail Privacy
// Protection pre-loads images, and Outlook blocks them until the reader
// allows images. That is why the dashboard also counts a button click or an
// RSVP page visit as "opened".

const SIG_LEN = 32;

async function sign(invitationId: string, attemptNumber: number): Promise<string> {
  return (await keyedHash(`email-open:${invitationId}:${attemptNumber}`)).slice(0, SIG_LEN);
}

export async function openTrackingToken(invitationId: string, attemptNumber: number): Promise<string> {
  return `${invitationId}.${attemptNumber}.${await sign(invitationId, attemptNumber)}`;
}

export async function verifyOpenTrackingToken(token: string): Promise<{ invitationId: string; attemptNumber: number } | null> {
  const clean = token.replace(/\.gif$/i, "");
  const [invitationId, attempt, sig] = clean.split(".");
  const attemptNumber = Number(attempt);
  if (!invitationId || !/^[0-9a-f-]{36}$/i.test(invitationId) || !Number.isInteger(attemptNumber) || attemptNumber < 1 || !sig) return null;
  return timingSafeEqualStr(sig, await sign(invitationId, attemptNumber)) ? { invitationId, attemptNumber } : null;
}

export function openTrackingUrl(token: string): string {
  return `${appOrigin()}/api/v1/public/track/open/${token}.gif`;
}

/** Adds the tracking image just before </body> (or at the end). */
export function withOpenPixel(html: string, url: string): string {
  const img = `<img src="${url}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;overflow:hidden" />`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${img}</body>`) : html + img;
}

// 1x1 transparent GIF
export const PIXEL_GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
