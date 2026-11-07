// Sets a user's password directly, for when nobody can sign in to reset it
// (e.g. the first super admin never opened the activation link).
//
//   APP_ENV=production DATABASE_URL=<direct url> USER_EMAIL=you@example.org \
//   NEW_PASSWORD='...' npx tsx scripts/set-password.ts
//
// An "invited" account becomes "active". Unused activation/reset links are
// cancelled and every session is signed out. MFA settings are not changed.
// Pass the password through the environment, never as a committed value.
import { PrismaClient } from "@prisma/client";
import { hashPassword, validatePassword } from "../src/lib/auth";

async function main() {
  const email = process.env.USER_EMAIL?.toLowerCase().trim();
  const password = process.env.NEW_PASSWORD ?? "";
  if (!email || !password) {
    console.error("Required: USER_EMAIL, NEW_PASSWORD");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (!user) {
    console.error(`No user with ${email}.`);
    process.exit(1);
  }
  if (user.status !== "active" && user.status !== "invited") {
    console.error(`${email} is "${user.status}". Reactivate the account before setting a password.`);
    process.exit(1);
  }
  const problem = validatePassword(password, user.email);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), status: "active", passwordChangedAt: new Date() },
    }),
    prisma.userInvite.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorType: "system",
        action: "auth.password_set_by_operator",
        entityType: "user",
        entityId: user.id,
        reason: "Password set via scripts/set-password.ts",
      },
    }),
  ]);
  await prisma.$disconnect();
  console.log(`Password set for ${user.email} (status: active). MFA ${user.mfaEnabledAt ? "is enrolled" : user.mfaRequired ? "enrolment is required at first sign-in" : "is unchanged"}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
