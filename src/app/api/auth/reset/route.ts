import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withOrigin } from "@/lib/authz";
import { HttpError, readJson } from "@/lib/http";
import { consumePasswordReset, hashPassword, validatePassword } from "@/lib/auth";
import { revokeUserSessions } from "@/lib/session";
import { logAuditEvent } from "@/lib/audit";
import { sha256Hex } from "@/lib/crypto";

const Body = z.object({ token: z.string().min(20).max(100), password: z.string().min(1).max(200) });

export const POST = withOrigin(async (req) => {
  const { token, password } = Body.parse(await readJson(req));

  // Validate the password before consuming the single-use token.
  const pending = await prisma.userInvite.findUnique({
    where: { tokenHash: await sha256Hex(token) },
    include: { user: true },
  });
  if (pending) {
    const problem = validatePassword(password, pending.user.email);
    if (problem) throw new HttpError(400, problem);
  }

  const userId = await consumePasswordReset(token);
  if (!userId) {
    throw new HttpError(400, "This reset link is invalid or has expired. Request a new one.");
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() },
  });
  // Sign out every device. MFA is unchanged and still applies at the next sign-in.
  await revokeUserSessions(user.id);
  await logAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "auth.password_reset",
    entityType: "user",
    entityId: user.id,
  });
  return NextResponse.json({ ok: true });
});
