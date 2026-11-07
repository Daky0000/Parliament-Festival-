import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { isDeployed } from "./config";
import { keyedHash, randomToken, sha256Hex } from "./crypto";
import { PRIVILEGED_ROLES } from "./roles";
import { HttpError } from "./http";

// Credentials, login throttling, MFA policy and staff invites.
// There is deliberately no "current user" fallback: see src/lib/authz.ts.

const BCRYPT_COST = 10;
// Compared against when the email is unknown, so timing does not reveal
// whether an account exists. (bcrypt hash of a random throwaway string.)
const DUMMY_HASH = "$2b$10$AfRqtmqfh0gxW4NOgn0lJ.PSMo2/jaImPoxDfu.Gtj2XsUWGNSja2";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX_BYTES = 72; // bcrypt silently truncates beyond 72 bytes

export function validatePassword(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "Password is too long.";
  if (email && password.toLowerCase().includes(email.toLowerCase().split("@")[0])) {
    return "Password must not contain your email name.";
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export const normalizeEmail = (email: string) => email.toLowerCase().trim();

/** Looks up by case-insensitive email (unique across orgs) and checks the password. */
export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
  });
  const hash = user?.passwordHash || DUMMY_HASH;
  const ok = await bcrypt.compare(password, hash);
  if (!user || !user.passwordHash || !ok || user.status !== "active") return null;
  return user;
}

// ---- Throttling ----------------------------------------------------------

const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { login_email: 5, login_ip: 30, reset_email: 3, reset_ip: 20, mfa: 5, mfa_email_send: 3, rsvp: 10, public_view: 60 } as const;
export type AttemptKind = keyof typeof LIMITS;

export async function attemptKey(kind: AttemptKind, value: string): Promise<string> {
  return keyedHash(`${kind}:${value}`);
}

async function failuresSince(keyHash: string, kind: AttemptKind): Promise<number> {
  return prisma.authAttempt.count({
    where: { keyHash, kind, succeeded: false, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
}

/** Throws 429 when the key has too many recent failures. Same response for known and unknown accounts. */
export async function assertNotThrottled(keyHash: string, kind: AttemptKind): Promise<void> {
  if ((await failuresSince(keyHash, kind)) >= LIMITS[kind]) {
    throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
  }
}

export async function recordAttempt(keyHash: string, kind: AttemptKind, succeeded: boolean): Promise<void> {
  await prisma.authAttempt.create({ data: { keyHash, kind, succeeded } });
  if (Math.random() < 0.02) {
    // Opportunistic cleanup of old rows.
    await prisma.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
  }
}

// ---- MFA policy ----------------------------------------------------------

/**
 * MFA is required for users flagged mfaRequired, and in deployed environments
 * for anyone holding a privileged role (super_admin, admin).
 */
export async function mfaRequiredFor(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roleAssignments: { where: { revokedAt: null }, include: { role: true } } },
  });
  if (!user) return true;
  if (user.mfaRequired || user.mfaEnabledAt) return true;
  if (!isDeployed()) return false;
  return user.roleAssignments.some((a) => PRIVILEGED_ROLES.includes(a.role.key));
}

/**
 * Email codes may stand in for the authenticator only if the user has signed
 * in with the authenticator since their password last changed. Otherwise
 * control of the mailbox alone (reset link, then email code) would be enough.
 * See docs/designs/mfa-email-fallback.md, M1.
 */
export function emailCodeAllowed(user: {
  authProvider: string;
  mfaEnabledAt: Date | null;
  mfaTotpVerifiedAt: Date | null;
  passwordChangedAt: Date | null;
}): "ok" | "not_enrolled" | "password_changed" {
  if (user.authProvider !== "local" || !user.mfaEnabledAt) return "not_enrolled";
  if (!user.mfaTotpVerifiedAt) return "password_changed";
  if (user.passwordChangedAt && user.mfaTotpVerifiedAt <= user.passwordChangedAt) return "password_changed";
  return "ok";
}

// ---- Staff invites -------------------------------------------------------

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/** Creates a single-use activation token; previous unused invites are removed. */
export async function issueInvite(userId: string, createdBy: string | null): Promise<string> {
  const rawToken = randomToken(32);
  await prisma.userInvite.deleteMany({ where: { userId, usedAt: null } });
  await prisma.userInvite.create({
    data: { userId, purpose: "invite", tokenHash: await sha256Hex(rawToken), expiresAt: new Date(Date.now() + INVITE_TTL_MS), createdBy },
  });
  return rawToken;
}

/** Atomically consumes an invite. Returns the userId, or null if invalid/expired/used. */
export async function consumeInvite(rawToken: string): Promise<string | null> {
  if (!rawToken || rawToken.length > 100) return null;
  const tokenHash = await sha256Hex(rawToken);
  const invite = await prisma.userInvite.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!invite || invite.purpose !== "invite" || invite.user.status !== "invited") return null;
  const res = await prisma.userInvite.updateMany({
    where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return res.count === 1 ? invite.userId : null;
}

// ---- Password reset ------------------------------------------------------

export const RESET_TTL_MS = 60 * 60 * 1000;

/** Creates a single-use, one-hour password reset token; older unused tokens are removed. */
export async function issuePasswordReset(userId: string): Promise<string> {
  const rawToken = randomToken(32);
  await prisma.userInvite.deleteMany({ where: { userId, usedAt: null } });
  await prisma.userInvite.create({
    data: {
      userId,
      purpose: "password_reset",
      tokenHash: await sha256Hex(rawToken),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
      createdBy: null,
    },
  });
  return rawToken;
}

/** Atomically consumes a reset token for an active account. Returns the userId, or null. */
export async function consumePasswordReset(rawToken: string): Promise<string | null> {
  if (!rawToken || rawToken.length > 100) return null;
  const tokenHash = await sha256Hex(rawToken);
  const reset = await prisma.userInvite.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!reset || reset.purpose !== "password_reset" || reset.user.status !== "active") return null;
  const res = await prisma.userInvite.updateMany({
    where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return res.count === 1 ? reset.userId : null;
}
