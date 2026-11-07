// Resets a user's two-step verification, for when nobody can do it from the
// Users page (e.g. the only super admin's authenticator no longer matches).
//
//   APP_ENV=production DATABASE_URL=<direct url> APP_URL=https://<host> \
//   USER_EMAIL=you@example.org npx tsx scripts/reset-mfa.ts
//
// The stored authenticator secret is deleted and every session is signed out.
// The password is not changed. The next sign-in shows a new QR code to scan;
// the old entry in the authenticator app stops working and can be deleted.
import { PrismaClient } from "@prisma/client";

async function main() {
  const email = process.env.USER_EMAIL?.toLowerCase().trim();
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (!email || !appUrl) {
    console.error("Required: USER_EMAIL, APP_URL");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (!user) {
    console.error(`No user with ${email}.`);
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null, mfaTotpVerifiedAt: null, mfaRequired: true },
    }),
    prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorType: "system",
        action: "user.mfa_reset",
        entityType: "user",
        entityId: user.id,
        reason: "Two-step verification reset via scripts/reset-mfa.ts",
      },
    }),
  ]);
  await prisma.$disconnect();

  console.log(`\nTwo-step verification reset for ${user.email}. All sessions signed out.`);
  console.log("Sign in with your password here; you will be shown a new QR code to scan:\n");
  console.log(`  ${appUrl}/login\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
