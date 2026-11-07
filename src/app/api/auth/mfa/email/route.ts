import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withOrigin } from "@/lib/authz";
import { HttpError, unauthorized } from "@/lib/http";
import { requirePendingSession } from "@/lib/auth-http";
import { assertNotThrottled, attemptKey, emailCodeAllowed, recordAttempt } from "@/lib/auth";
import { EMAIL_CODE_RESEND_MS, EMAIL_CODE_TTL_MS, emailCodeHash, generateEmailCode, maskEmail, PASSWORD_CHANGED_MESSAGE } from "@/lib/mfa-email";
import { sendMfaCodeEmail } from "@/lib/email/mfa-code";
import { logAuditEvent } from "@/lib/audit";

// Emails a 6-digit sign-in code to a user who cannot use their authenticator.
// See docs/designs/mfa-email-fallback.md §4.1.

export const POST = withOrigin(async (req) => {
  const pending = await requirePendingSession(req);
  const session = await prisma.session.findFirst({ where: { id: pending.id, revokedAt: null, mfaPending: true } });
  if (!session) throw unauthorized();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

  const allowed = emailCodeAllowed(user);
  if (allowed === "not_enrolled") throw new HttpError(409, "Set up your authenticator app first.");
  if (allowed === "password_changed") {
    await logAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "auth.mfa_email_refused",
      entityType: "user",
      entityId: user.id,
      outcome: "denied",
      reason: "Password changed since the last authenticator sign-in",
    });
    throw new HttpError(403, PASSWORD_CHANGED_MESSAGE);
  }

  const sendKey = await attemptKey("mfa_email_send", user.id);
  await assertNotThrottled(sendKey, "mfa_email_send");

  // Claim the resend slot atomically, so two clicks cannot both send.
  const code = generateEmailCode();
  const now = new Date();
  const claimed = await prisma.session.updateMany({
    where: {
      id: session.id,
      revokedAt: null,
      mfaPending: true,
      OR: [{ emailCodeSentAt: null }, { emailCodeSentAt: { lt: new Date(now.getTime() - EMAIL_CODE_RESEND_MS) } }],
    },
    data: {
      emailCodeHash: await emailCodeHash(session.id, code),
      emailCodeExpiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
      emailCodeSentAt: now,
    },
  });
  if (claimed.count !== 1) throw new HttpError(409, "Wait a minute before asking for another code.");
  // Counted row: the throttle counts only succeeded:false.
  await recordAttempt(sendKey, "mfa_email_send", false);

  const sent = await sendMfaCodeEmail(
    { to: user.email, fullName: user.fullName, code },
    `mfa_email_${session.id}_${now.getTime()}`
  );
  if (!sent.ok) {
    await prisma.session.updateMany({
      where: { id: session.id },
      data: { emailCodeHash: null, emailCodeExpiresAt: null, emailCodeSentAt: null },
    });
    await logAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "auth.mfa_email_send_failed",
      entityType: "user",
      entityId: user.id,
      outcome: "failed",
      reason: sent.message?.slice(0, 200),
    });
    throw new HttpError(502, "We couldn't send the email. Use your authenticator app or try again.");
  }

  await logAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "auth.mfa_email_sent",
    entityType: "user",
    entityId: user.id,
  });
  return NextResponse.json({ ok: true, sentTo: maskEmail(user.email), expiresInSeconds: EMAIL_CODE_TTL_MS / 1000 });
});
