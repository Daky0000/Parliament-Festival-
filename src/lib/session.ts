import { prisma } from "./db";
import { appEnv } from "./config";
import { randomToken, sha256Hex } from "./crypto";

// Server-side sessions. The browser holds a random 32-byte token; the
// database holds only sha256(token) as the session id.

export const ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
export const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function sessionCookieName(): string {
  return appEnv() === "local" || appEnv() === "ci" ? "pf_session" : "__Host-pf_session";
}

export function sessionCookieOptions() {
  const secure = !(appEnv() === "local" || appEnv() === "ci");
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
}

export type SessionRecord = {
  id: string;
  userId: string;
  mfaPending: boolean;
};

export async function createSession(
  userId: string,
  opts: { mfaPending: boolean; userAgent?: string | null; ipHash?: string | null }
): Promise<{ rawToken: string; session: SessionRecord }> {
  const rawToken = randomToken(32);
  const id = await sha256Hex(rawToken);
  const now = Date.now();
  const session = await prisma.session.create({
    data: {
      id,
      userId,
      expiresAt: new Date(now + ABSOLUTE_TTL_MS),
      mfaPending: opts.mfaPending,
      userAgent: opts.userAgent?.slice(0, 200) ?? null,
      ipHash: opts.ipHash ?? null,
    },
    select: { id: true, userId: true, mfaPending: true },
  });
  return { rawToken, session };
}

/** Returns the session if valid (not revoked, not expired, not idle, user active). */
export async function validateSession(rawToken: string | undefined | null): Promise<SessionRecord | null> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 100) return null;
  const id = await sha256Hex(rawToken);
  const s = await prisma.session.findUnique({
    where: { id },
    include: { user: { select: { status: true } } },
  });
  if (!s || s.revokedAt || s.user.status !== "active") return null;
  const now = Date.now();
  if (now >= s.expiresAt.getTime()) return null;
  if (now - s.lastSeenAt.getTime() >= IDLE_TTL_MS) return null;
  if (now - s.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    await prisma.session.update({ where: { id }, data: { lastSeenAt: new Date(now) } });
  }
  return { id: s.id, userId: s.userId, mfaPending: s.mfaPending };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeSessionByToken(rawToken: string | undefined | null): Promise<void> {
  if (!rawToken) return;
  await revokeSession(await sha256Hex(rawToken));
}

/** Revokes every live session of a user, optionally keeping one. */
export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const res = await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return res.count;
}
