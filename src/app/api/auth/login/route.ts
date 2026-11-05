import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withOrigin, clientIp } from "@/lib/authz";
import { readJson, HttpError } from "@/lib/http";
import { assertNotThrottled, attemptKey, mfaRequiredFor, recordAttempt, verifyCredentials } from "@/lib/auth";
import { createSession, revokeSessionByToken } from "@/lib/session";
import { setSessionCookie, rawSessionToken } from "@/lib/auth-http";
import { keyedHash } from "@/lib/crypto";
import { logAuditEvent } from "@/lib/audit";

const Body = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

export const POST = withOrigin(async (req) => {
  const { email, password } = Body.parse(await readJson(req));
  const ip = clientIp(req);
  const ipKey = await attemptKey("login_ip", ip);
  const emailKey = await attemptKey("login_email", email.toLowerCase());
  await assertNotThrottled(ipKey, "login_ip");
  await assertNotThrottled(emailKey, "login_email");

  const user = await verifyCredentials(email, password);
  if (!user) {
    await recordAttempt(ipKey, "login_ip", false);
    await recordAttempt(emailKey, "login_email", false);
    throw new HttpError(401, "Invalid email or password");
  }
  await recordAttempt(emailKey, "login_email", true);

  const needsMfa = await mfaRequiredFor(user.id);
  await revokeSessionByToken(rawSessionToken(req));
  const ipHash = await keyedHash(ip);
  const { rawToken } = await createSession(user.id, {
    mfaPending: needsMfa,
    userAgent: req.headers.get("user-agent"),
    ipHash,
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "auth.login_succeeded",
    entityType: "user",
    entityId: user.id,
    ipHash,
  });

  const mfa = !needsMfa ? "none" : user.mfaEnabledAt ? "verify" : "enroll";
  return setSessionCookie(NextResponse.json({ mfa }), rawToken);
});
