// Email sign-in codes: the fallback for two-step verification when the
// authenticator app is unavailable. See docs/designs/mfa-email-fallback.md.
import { keyedHash } from "./crypto";

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_RESEND_MS = 60 * 1000;

export const PASSWORD_CHANGED_MESSAGE =
  "Email codes are unavailable until you next sign in with your authenticator app, because your password was changed. Ask a super admin to reset two-step verification.";

/** Uniform 6-digit code (rejection sampling, so no modulo bias). */
export function generateEmailCode(): string {
  const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return String(buf[0] % 1_000_000).padStart(6, "0");
  }
}

/** Bound to the pending session, so a code only finishes the sign-in that asked for it. */
export function emailCodeHash(sessionId: string, code: string): Promise<string> {
  return keyedHash(`mfa_email:${sessionId}:${code}`);
}

/** "dakya@gmail.com" -> "d•••@gmail.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}
