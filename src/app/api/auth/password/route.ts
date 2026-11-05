import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor } from "@/lib/authz";
import { HttpError, readJson } from "@/lib/http";
import { hashPassword, validatePassword } from "@/lib/auth";
import { createSession, revokeSession, revokeUserSessions } from "@/lib/session";
import { setSessionCookie } from "@/lib/auth-http";
import { logAuditEvent } from "@/lib/audit";

const Body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });

export const POST = withActor(async (req, { actor }) => {
  const { currentPassword, newPassword } = Body.parse(await readJson(req));
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect.");
  }
  const problem = validatePassword(newPassword, user.email);
  if (problem) throw new HttpError(400, problem);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
  });
  await prisma.userInvite.deleteMany({ where: { userId: user.id, usedAt: null } });
  // Every other device is signed out; this one gets a fresh session.
  await revokeUserSessions(user.id, actor.sessionId);
  await revokeSession(actor.sessionId);
  const { rawToken } = await createSession(user.id, { mfaPending: false, userAgent: req.headers.get("user-agent") });
  await logAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "auth.password_changed",
    entityType: "user",
    entityId: user.id,
  });
  return setSessionCookie(NextResponse.json({ ok: true }), rawToken);
});
