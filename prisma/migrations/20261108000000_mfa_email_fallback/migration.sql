-- Email sign-in code as a fallback for two-step verification.
-- Expand-only: older deployments ignore these columns.
ALTER TABLE "users" ADD COLUMN "mfaTotpVerifiedAt" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN "emailCodeHash" TEXT;
ALTER TABLE "sessions" ADD COLUMN "emailCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN "emailCodeSentAt" TIMESTAMP(3);

-- Enrolled users have signed in with their authenticator at least once.
UPDATE "users" SET "mfaTotpVerifiedAt" = "mfaEnabledAt" WHERE "mfaEnabledAt" IS NOT NULL;
