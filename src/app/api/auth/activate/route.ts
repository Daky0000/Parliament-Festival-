import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withOrigin } from "@/lib/authz";
import { HttpError, readJson } from "@/lib/http";
import { consumeInvite, hashPassword, mfaRequiredFor, validatePassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { setSessionCookie } from "@/lib/auth-http";
import { logAuditEvent } from "@/lib/audit";
import { sha256Hex } from "@/lib/crypto";

const Body = z.object({ token: z.string().min(20).max(100), password: z.string().min(1).max(200) });

export const POST = withOrigin(async (req) => {
  const { token, password } = Body.parse(await readJson(req));

  // Validate the password before consuming the single-use invite.
  const pending = await prisma.userInvite.findUnique({
    where: { tokenHash: await sha256Hex(token) },
    include: { user: true },
  });
  if (pending) {
    const problem = validatePassword(password, pending.user.email);
    if (problem) throw new HttpError(400, problem);
  }

  const userId = await consumeInvite(token);
  if (!userId) {
    throw new HttpError(400, "This activation link is invalid or has expired. Ask an administrator for a new one.");
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), status: "active", passwordChangedAt: new Date() },
  });
  await logAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "user.activated",
    entityType: "user",
    entityId: user.id,
  });
  const needsMfa = await mfaRequiredFor(user.id);
  const { rawToken } = await createSession(user.id, { mfaPending: needsMfa, userAgent: req.headers.get("user-agent") });
  const mfa = !needsMfa ? "none" : user.mfaEnabledAt ? "verify" : "enroll";
  return setSessionCookie(NextResponse.json({ mfa }), rawToken);
});
