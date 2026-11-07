import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withOrigin, clientIp } from "@/lib/authz";
import { readJson } from "@/lib/http";
import { assertNotThrottled, attemptKey, issuePasswordReset, normalizeEmail, recordAttempt } from "@/lib/auth";
import { appOrigin } from "@/lib/config";
import { logAuditEvent } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";

const Body = z.object({ email: z.string().trim().email().max(254) });

// Always answers the same way, so the response never reveals whether an
// account exists. Every request counts against the per-email and per-IP limits.
export const POST = withOrigin(async (req) => {
  const { email } = Body.parse(await readJson(req));
  const normalized = normalizeEmail(email);
  const ipKey = await attemptKey("reset_ip", clientIp(req));
  const emailKey = await attemptKey("reset_email", normalized);
  await assertNotThrottled(ipKey, "reset_ip");
  await assertNotThrottled(emailKey, "reset_email");
  await recordAttempt(ipKey, "reset_ip", false);
  await recordAttempt(emailKey, "reset_email", false);

  const user = await prisma.user.findFirst({ where: { email: { equals: normalized, mode: "insensitive" } } });
  if (user && user.status === "active" && user.authProvider === "local") {
    const token = await issuePasswordReset(user.id);
    const sent = await sendPasswordResetEmail({
      to: user.email,
      fullName: user.fullName,
      resetUrl: `${appOrigin()}/reset-password/${token}`,
    });
    await logAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "auth.password_reset_requested",
      entityType: "user",
      entityId: user.id,
      afterData: { emailSent: sent.ok, emailError: sent.ok ? null : sent.message ?? null },
    });
  }
  return NextResponse.json({ ok: true });
});
