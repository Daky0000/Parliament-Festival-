import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withOrigin } from "@/lib/authz";
import { HttpError, readJson } from "@/lib/http";
import { requirePendingSession, setSessionCookie } from "@/lib/auth-http";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { attemptKey, assertNotThrottled, recordAttempt } from "@/lib/auth";
import { createSession, revokeSession } from "@/lib/session";
import { logAuditEvent } from "@/lib/audit";

const Body = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });
const MAX_FAILURES = 5;

export const POST = withOrigin(async (req) => {
  const session = await requirePendingSession(req);
  const { code } = Body.parse(await readJson(req));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const key = await attemptKey("mfa", user.id);
  await assertNotThrottled(key, "mfa");

  const enrolling = !user.mfaEnabledAt;
  const column = enrolling ? "mfaPendingSecretEnc" : "mfaSecretEnc";
  const blob = enrolling ? user.mfaPendingSecretEnc : user.mfaSecretEnc;
  if (!blob) throw new HttpError(409, "Start MFA setup first.");
  const secret = await decryptSecret(blob, `users.${column}:${user.id}`);

  const step = await verifyTotp(secret, code, { lastStep: user.mfaLastStep });
  if (step === null) {
    await recordAttempt(key, "mfa", false);
    await logAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "auth.mfa_failed",
      entityType: "user",
      entityId: user.id,
      outcome: "failed",
    });
    const failures = await prisma.authAttempt.count({
      where: { keyHash: key, kind: "mfa", succeeded: false, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
    });
    // Too many wrong codes: kill the pending session; the user must log in again.
    if (failures >= MAX_FAILURES) await revokeSession(session.id);
    throw new HttpError(401, "Incorrect code");
  }

  await recordAttempt(key, "mfa", true);
  await prisma.user.update({
    where: { id: user.id },
    data: enrolling
      ? {
          mfaSecretEnc: await encryptSecret(secret, `users.mfaSecretEnc:${user.id}`),
          mfaPendingSecretEnc: null,
          mfaEnabledAt: new Date(),
          mfaLastStep: step,
        }
      : { mfaLastStep: step },
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

  // Rotate: the pending session is replaced by a full one.
  await revokeSession(session.id);
  const { rawToken } = await createSession(user.id, { mfaPending: false, userAgent: req.headers.get("user-agent") });
  return setSessionCookie(NextResponse.json({ ok: true }), rawToken);
});
