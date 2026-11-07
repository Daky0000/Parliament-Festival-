import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, requireGlobal } from "@/lib/authz";
import { HttpError, readJson } from "@/lib/http";
import { issueInvite, normalizeEmail } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { appOrigin } from "@/lib/config";
import { assertCanGrant, roleIdFor } from "@/lib/user-admin";
import { sendStaffInviteEmail } from "@/lib/email/staff-invite";

export const GET = withActor(async (_req, { actor }) => {
  requireGlobal(actor, "users.read");
  const users = await prisma.user.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { fullName: "asc" },
    include: {
      roleAssignments: { where: { revokedAt: null }, include: { role: true, event: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({
    data: users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      mfaEnabled: !!u.mfaEnabledAt,
      mfaRequired: u.mfaRequired,
      lastLoginAt: u.lastLoginAt,
      roles: u.roleAssignments.map((a) => ({
        assignmentId: a.id,
        roleKey: a.role.key,
        roleName: a.role.name,
        event: a.event,
      })),
    })),
  });
});

const Invite = z.object({
  email: z.string().trim().email().max(254),
  fullName: z.string().trim().min(2).max(120),
  roleKey: z.string().min(1),
  eventId: z.string().min(1).nullish(),
});

export const POST = withActor(async (request, { actor }) => {
  requireGlobal(actor, "users.create");
  const body = Invite.parse(await readJson(request));
  const email = normalizeEmail(body.email);
  await assertCanGrant(actor, body.roleKey, body.eventId ?? null);

  const clash = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (clash) throw new HttpError(409, "A user with this email already exists.");

  const roleId = await roleIdFor(actor.organizationId, body.roleKey);
  const user = await prisma.user.create({
    data: { organizationId: actor.organizationId, email, fullName: body.fullName, status: "invited" },
  });
  await prisma.userRoleAssignment.create({
    data: { userId: user.id, roleId, eventId: body.eventId ?? null, assignedBy: actor.userId },
  });
  const token = await issueInvite(user.id, actor.userId);
  await logAuditEvent({
    organizationId: actor.organizationId,
    eventId: body.eventId ?? undefined,
    actorUserId: actor.userId,
    action: "user.invited",
    entityType: "user",
    entityId: user.id,
    afterData: { roleKey: body.roleKey, eventId: body.eventId ?? null },
  });

  // Email the activation link to the new user. The link is also returned
  // once as a fallback; only its hash is stored.
  const activationUrl = `${appOrigin()}/activate/${token}`;
  const [role, ev, inviter] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId }, select: { name: true } }),
    body.eventId ? prisma.event.findUnique({ where: { id: body.eventId }, select: { name: true } }) : null,
    prisma.user.findUnique({ where: { id: actor.userId }, select: { fullName: true } }),
  ]);
  const email_ = await sendStaffInviteEmail(
    email,
    { fullName: body.fullName, roleName: role?.name ?? body.roleKey, eventName: ev?.name ?? null, activationUrl, invitedBy: inviter?.fullName ?? null },
    `staff-invite-${user.id}-${token.slice(0, 12)}`
  );
  await logAuditEvent({
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: email_.sent ? "user.invite_emailed" : "user.invite_email_failed",
    entityType: "user",
    entityId: user.id,
    afterData: { provider: email_.provider, ...(email_.error ? { error: email_.error.slice(0, 200) } : {}) },
  });
  return NextResponse.json(
    { data: { userId: user.id, activationUrl, emailSent: email_.sent, emailedTo: email, emailError: email_.error ?? null } },
    { status: 201 }
  );
});
