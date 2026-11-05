// Bootstraps the first Super Admin in a fresh environment (staging/production).
//
//   APP_ENV=production DATABASE_URL=<direct url> APP_ENCRYPTION_KEY=... \
//   ADMIN_EMAIL=you@example.org ADMIN_NAME="Full Name" ORG_NAME="Parliament of Ghana" ORG_SLUG=parliament-gh \
//   APP_URL=https://<host> npx tsx scripts/create-admin.ts
//
// Creates the organization if missing, syncs system roles, creates the user
// as "invited" with the super_admin role and prints a one-time activation
// link. MFA enrolment is forced at first sign-in. Refuses if a super admin
// already exists unless --force-additional is passed.
import { PrismaClient } from "@prisma/client";
import { syncRoles } from "../src/lib/roles";
import { issueInvite } from "../src/lib/auth";

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const fullName = process.env.ADMIN_NAME?.trim();
  const orgSlug = process.env.ORG_SLUG?.trim();
  const orgName = process.env.ORG_NAME?.trim() || orgSlug;
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (!email || !fullName || !orgSlug || !appUrl) {
    console.error("Required: ADMIN_EMAIL, ADMIN_NAME, ORG_SLUG, APP_URL");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: {},
    create: { slug: orgSlug, name: orgName!, status: "active" },
  });
  const roleIds = await syncRoles(prisma, org.id);

  const existingSuper = await prisma.userRoleAssignment.count({
    where: { roleId: roleIds.super_admin, revokedAt: null },
  });
  if (existingSuper > 0 && !process.argv.includes("--force-additional")) {
    console.error("A super admin already exists. Use the Users page, or pass --force-additional.");
    process.exit(1);
  }

  const clash = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (clash) {
    console.error(`A user with ${email} already exists.`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: { organizationId: org.id, email, fullName, status: "invited", mfaRequired: true },
  });
  await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: roleIds.super_admin, assignedBy: "bootstrap" } });
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorType: "system",
      action: "user.invited",
      entityType: "user",
      entityId: user.id,
      reason: "Bootstrap super admin via scripts/create-admin.ts",
    },
  });
  const token = await issueInvite(user.id, null);
  await prisma.$disconnect();

  console.log("\nSuper admin created. Activation link (valid 72 hours, shown once):\n");
  console.log(`  ${appUrl}/activate/${token}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
