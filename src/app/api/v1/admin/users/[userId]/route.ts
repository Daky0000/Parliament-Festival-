import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, requireGlobal } from "@/lib/authz";
import { HttpError, readJson } from "@/lib/http";
import { issueInvite } from "@/lib/auth";
import { revokeUserSessions } from "@/lib/session";
import { logAuditEvent } from "@/lib/audit";
import { appOrigin } from "@/lib/config";
import { assertCanGrant, loadTargetUser, roleIdFor } from "@/lib/user-admin";
import { sendStaffInviteEmail } from "@/lib/email/staff-invite";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reissue_invite") }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("reactivate") }),
  z.object({ action: z.literal("grant_role"), roleKey: z.string().min(1), eventId: z.string().min(1).nullish() }),
  z.object({ action: z.literal("revoke_role"), assignmentId: z.string().min(1) }),
  z.object({ action: z.literal("revoke_sessions") }),
  z.object({ action: z.literal("require_mfa"), required: z.boolean() }),
  z.object({ action: z.literal("reset_mfa") }),
]);

const PERMISSION = {
  reissue_invite: "users.create",
  suspend: "users.suspend",
  reactivate: "users.suspend",
  grant_role: "users.update",
  revoke_role: "users.update",
  revoke_sessions: "users.update",
  require_mfa: "users.update",
  reset_mfa: "users.update",
} as const;

export const POST = withActor<{ userId: string }>(async (request, { actor, params }) => {
  const body = Body.parse(await readJson(request));
  requireGlobal(actor, PERMISSION[body.action]);
  const target = await loadTargetUser(actor, params.userId, { allowSelf: body.action === "revoke_sessions" });
  const audit = (action: string, extra: Record<string, unknown> = {}) =>
    logAuditEvent({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action,
      entityType: "user",
      entityId: target.id,
      afterData: extra,
    });

  switch (body.action) {
    case "reissue_invite": {
      // Only for accounts that were never activated; otherwise this would
      // let an admin take over an active account.
      if (target.status !== "invited") throw new HttpError(409, "This account is already active.");
      const token = await issueInvite(target.id, actor.userId);
      const activationUrl = `${appOrigin()}/activate/${token}`;
      const assignment = await prisma.userRoleAssignment.findFirst({
        where: { userId: target.id, revokedAt: null },
        include: { role: { select: { name: true } }, event: { select: { name: true } } },
      });
      const inviter = await prisma.user.findUnique({ where: { id: actor.userId }, select: { fullName: true } });
      const sent = await sendStaffInviteEmail(
        target.email,
        { fullName: target.fullName, roleName: assignment?.role.name ?? "staff member", eventName: assignment?.event?.name ?? null, activationUrl, invitedBy: inviter?.fullName ?? null },
        `staff-invite-${target.id}-${token.slice(0, 12)}`
      );
      await audit("user.invite_reissued", { emailSent: sent.sent, ...(sent.error ? { error: sent.error.slice(0, 200) } : {}) });
      return NextResponse.json({ data: { activationUrl, emailSent: sent.sent, emailedTo: target.email, emailError: sent.error ?? null } });
    }
    case "suspend": {
      await prisma.user.update({ where: { id: target.id }, data: { status: "suspended" } });
      await revokeUserSessions(target.id);
      await audit("user.suspended");
      return NextResponse.json({ ok: true });
    }
    case "reactivate": {
      if (target.status !== "suspended") throw new HttpError(409, "Only suspended accounts can be reactivated.");
      await prisma.user.update({ where: { id: target.id }, data: { status: "active" } });
      await audit("user.reactivated");
      return NextResponse.json({ ok: true });
    }
    case "grant_role": {
      await assertCanGrant(actor, body.roleKey, body.eventId ?? null);
      const roleId = await roleIdFor(actor.organizationId, body.roleKey);
      const exists = await prisma.userRoleAssignment.findFirst({
        where: { userId: target.id, roleId, eventId: body.eventId ?? null, revokedAt: null },
      });
      if (!exists) {
        await prisma.userRoleAssignment.create({
          data: { userId: target.id, roleId, eventId: body.eventId ?? null, assignedBy: actor.userId },
        });
      }
      await revokeUserSessions(target.id);
      await audit("user.role_granted", { roleKey: body.roleKey, eventId: body.eventId ?? null });
      return NextResponse.json({ ok: true });
    }
    case "revoke_role": {
      const assignment = target.roleAssignments.find((a) => a.id === body.assignmentId);
      if (!assignment) throw new HttpError(404, "Not found");
      await prisma.userRoleAssignment.update({ where: { id: assignment.id }, data: { revokedAt: new Date() } });
      await revokeUserSessions(target.id);
      await audit("user.role_revoked", { roleKey: assignment.role.key, eventId: assignment.eventId });
      return NextResponse.json({ ok: true });
    }
    case "revoke_sessions": {
      const count = await revokeUserSessions(target.id, target.id === actor.userId ? actor.sessionId : undefined);
      await audit("user.sessions_revoked", { count });
      return NextResponse.json({ ok: true, revoked: count });
    }
    case "require_mfa": {
      await prisma.user.update({ where: { id: target.id }, data: { mfaRequired: body.required } });
      await audit("user.mfa_requirement_changed", { required: body.required });
      return NextResponse.json({ ok: true });
    }
    case "reset_mfa": {
      // Recovery for a lost authenticator. Super admins only; forces re-enrolment.
      if (!actor.isSuperAdmin) throw new HttpError(403, "Only a super admin can reset two-step verification.");
      await prisma.user.update({
        where: { id: target.id },
        data: { mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null, mfaRequired: true },
      });
      await revokeUserSessions(target.id);
      await audit("user.mfa_reset");
      return NextResponse.json({ ok: true });
    }
  }
});
