import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withOrigin } from "@/lib/authz";
import { HttpError } from "@/lib/http";
import { requirePendingSession } from "@/lib/auth-http";
import { encryptSecret } from "@/lib/crypto";
import { generateTotpSecret, otpauthUrl } from "@/lib/totp";

// Starts enrolment for a pending session. Refused once MFA is enabled, so a
// password alone can never replace an existing authenticator.
export const POST = withOrigin(async (req) => {
  const session = await requirePendingSession(req);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (user.mfaEnabledAt) throw new HttpError(409, "MFA is already set up. Enter a code from your authenticator.");

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaPendingSecretEnc: await encryptSecret(secret, `users.mfaPendingSecretEnc:${user.id}`) },
  });
  // The QR code is rendered in the browser from otpauthUrl.
  return NextResponse.json({ otpauthUrl: otpauthUrl(secret, user.email), secret });
});
