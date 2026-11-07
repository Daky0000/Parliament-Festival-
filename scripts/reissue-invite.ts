// Prints a fresh activation link for an account that has not been activated yet
// (status "invited"), e.g. when the first link expired or was lost.
//
//   APP_ENV=production DATABASE_URL=<direct url> APP_URL=https://<host> \
//   USER_EMAIL=you@example.org npx tsx scripts/reissue-invite.ts
//
// Any older unused link for the user stops working. Accounts that are already
// active are refused: they should use their password, or an admin can reset it.
import { PrismaClient } from "@prisma/client";
import { issueInvite } from "../src/lib/auth";

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
  if (user.status !== "invited") {
    console.error(`${email} is "${user.status}", not "invited". Activation links only work for invited accounts.`);
    process.exit(1);
  }

  const token = await issueInvite(user.id, null);
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorType: "system",
      action: "user.invite_reissued",
      entityType: "user",
      entityId: user.id,
      reason: "Activation link re-issued via scripts/reissue-invite.ts",
    },
  });
  await prisma.$disconnect();

  console.log("\nActivation link (valid 72 hours, shown once):\n");
  console.log(`  ${appUrl}/activate/${token}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
