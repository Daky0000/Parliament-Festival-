// Local/staging helper: invites an usher for an event and assigns a gate.
//   ADMIN_EMAIL is not needed; run with APP_ENV, DATABASE_URL, APP_URL set:
//   npx tsx scripts/create-usher.ts <email> "<Full Name>" <EVENT_CODE> [GATE_CODE]
// Prints a one-time activation link; the usher sets their own password.
import { PrismaClient } from "@prisma/client";
import { syncRoles } from "../src/lib/roles";
import { issueInvite } from "../src/lib/auth";
import { appOrigin } from "../src/lib/config";

async function main() {
  const [email, fullName, eventCode, gateCode = "MAIN"] = process.argv.slice(2);
  if (!email || !fullName || !eventCode) {
    console.error('Usage: npx tsx scripts/create-usher.ts <email> "<Full Name>" <EVENT_CODE> [GATE_CODE]');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const event = await prisma.event.findFirst({ where: { eventCode } });
  if (!event) throw new Error(`Event ${eventCode} not found`);
  const roleIds = await syncRoles(prisma, event.organizationId);
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing && existing.status !== "invited") throw new Error(`${email} already has an active account`);
  const user =
    existing ??
    (await prisma.user.create({ data: { organizationId: event.organizationId, email: email.toLowerCase(), fullName, status: "invited" } }));
  if (!(await prisma.userRoleAssignment.findFirst({ where: { userId: user.id, roleId: roleIds.usher, eventId: event.id, revokedAt: null } }))) {
    await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: roleIds.usher, eventId: event.id, assignedBy: "create-usher" } });
  }
  const gate = await prisma.gate.findUnique({ where: { eventId_code: { eventId: event.id, code: gateCode } } });
  if (gate && !(await prisma.userGateAssignment.findFirst({ where: { userId: user.id, gateId: gate.id, revokedAt: null } }))) {
    await prisma.userGateAssignment.create({ data: { userId: user.id, gateId: gate.id, assignedBy: "create-usher" } });
  }
  await prisma.auditLog.create({
    data: { organizationId: event.organizationId, eventId: event.id, actorType: "system", action: "user.invited", entityType: "user", entityId: user.id, reason: "scripts/create-usher.ts" },
  });
  const token = await issueInvite(user.id, null);
  await prisma.$disconnect();
  console.log(`\nUsher ${fullName} <${email}> for ${event.name}${gate ? `, gate ${gate.name}` : ""}.`);
  console.log(`Activation link (one-time, 72 hours):\n  ${appOrigin()}/activate/${token}\n`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
