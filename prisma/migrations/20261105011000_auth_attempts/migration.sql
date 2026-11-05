-- CreateTable
CREATE TABLE "auth_attempts" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_attempts_keyHash_kind_createdAt_idx" ON "auth_attempts"("keyHash", "kind", "createdAt");


-- Staff sign in with email only, so an email identifies exactly one user
-- across all organizations (case-insensitive).
CREATE UNIQUE INDEX "uq_users_email_ci" ON "users" (lower("email"));
