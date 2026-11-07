import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withOrigin } from "@/lib/authz";
import { HttpError, readJson, unauthorized } from "@/lib/http";
import { requirePendingSession, setSessionCookie } from "@/lib/auth-http";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { attemptKey, assertNotThrottled, emailCodeAllowed, recordAttempt } from "@/lib/auth";
import { createSession, revokeSession } from "@/lib/session";
import { logAuditEvent } from "@/lib/audit";
import { emailCodeHash, PASSWORD_CHANGED_MESSAGE } from "@/lib/mfa-email";
import { sendMfaNoticeEmail } from "@/lib/email/mfa-code";

const Body = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  method: z.enum(["totp", "email"]).default("totp"),
});
const MAX_FAILURES = 5;

export const POST = withOrigin(async (req) => {
  const pending = await requirePendingSession(req);
  const { code, method } = Body.parse(await readJson(req));
  const session = await prisma.session.findFirst({ where: { id: pending.id, revokedAt: null, mfaPending: true } });
  if (!session) throw unauthorized();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const key = await attemptKey("mfa", user.id);
  await assertNotThrottled(key, "mfa");

  // Wrong TOTP codes and wrong email codes share one failure budget.
  async function fail(message: string): Promise<never> {
    await recordAttempt(key, "mfa", false);
    await logAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "auth.mfa_failed",
      entityType: "user",
      entityId: user.id,
      outcome: "failed",
      afterData: { method },
    });
    const failures = await prisma.authAttempt.count({
      where: { keyHash: key, kind: "mfa", succeeded: false, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
    });
    // Too many wrong codes: kill the pending session; the user must log in again.
    if (failures >= MAX_FAILURES) await revokeSession(session!.id);
    throw new HttpError(401, message);
  }

  const enrolling = !user.mfaEnabledAt;

  if (method === "email") {
    const allowed = emailCodeAllowed(user);
    if (allowed === "not_enrolled") throw new HttpError(409, "Set up your authenticator app first.");
    if (allowed === "password_changed") throw new HttpError(403, PASSWORD_CHANGED_MESSAGE);
    // Consume atomically: of two requests with the same code, only one succeeds.
    const consumed = await prisma.session.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
        mfaPending: true,
        emailCodeHash: await emailCodeHash(session.id, code),
        emailCodeExpiresAt: { gt: new Date() },
      },
      data: { emailCodeHash: null, emailCodeExpiresAt: null },
    });
    if (consumed.count !== 1) await fail("Incorrect or expired code");

    await recordAttempt(key, "mfa", true);
    await logAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "auth.mfa_email_verified",
      entityType: "user",
      entityId: user.id,
    });
    const userAgent = req.headers.get("user-agent");
    const notice = await sendMfaNoticeEmail(
      { to: user.email, fullName: user.fullName, when: new Date(), userAgent },
      `mfa_email_notice_${session.id}`
    ).catch((e: Error) => ({ ok: false, message: e.message }));
    if (!notice.ok) console.warn(`MFA email notice not sent for user ${user.id}: ${notice.message}`);
  } else {
    const column = enrolling ? "mfaPendingSecretEnc" : "mfaSecretEnc";
    const blob = enrolling ? user.mfaPendingSecretEnc : user.mfaSecretEnc;
    if (!blob) throw new HttpError(409, "Start MFA setup first.");
    const secret = await decryptSecret(blob, `users.${column}:${user.id}`);

    const step = await verifyTotp(secret, code, { lastStep: user.mfaLastStep });
    if (step === null) await fail("Incorrect code");

    await recordAttempt(key, "mfa", true);
    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: enrolling
        ? {
            mfaSecretEnc: await encryptSecret(secret, `users.mfaSecretEnc:${user.id}`),
            mfaPendingSecretEnc: null,
            mfaEnabledAt: now,
            mfaLastStep: step,
            mfaTotpVerifiedAt: now,
          }
        : { mfaLastStep: step, mfaTotpVerifiedAt: now },
    });
    if (enrolling) {
      await logAuditEvent({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "auth.mfa_enrolled",
        entityType: "user",
        entityId: user.id,
      });
    }
  }

  // Rotate: the pending session is replaced by a full one.
  await revokeSession(session.id);
  const { rawToken } = await createSession(user.id, {
    mfaPending: false,
    userAgent: req.headers.get("user-agent"),
    ipHash: session.ipHash,
  });
  return setSessionCookie(NextResponse.json({ ok: true }), rawToken);
});
