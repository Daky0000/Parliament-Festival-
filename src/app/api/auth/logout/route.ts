import { NextResponse } from "next/server";
import { withOrigin } from "@/lib/authz";
import { validateSession, revokeSession } from "@/lib/session";
import { clearSessionCookie, rawSessionToken } from "@/lib/auth-http";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

export const POST = withOrigin(async (req) => {
  const session = await validateSession(rawSessionToken(req));
  if (session) {
    await revokeSession(session.id);
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user) {
      await logAuditEvent({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "auth.logout",
        entityType: "user",
        entityId: user.id,
      });
    }
  }
  return clearSessionCookie(NextResponse.json({ ok: true }));
});
