-- Password reset links share the single-use token table with staff invites.
ALTER TABLE "user_invites" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'invite';
