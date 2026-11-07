-- Dashboard menu items a super admin has hidden from other users.
-- Expand-only: older deployments ignore this column.
ALTER TABLE "organizations" ADD COLUMN "hiddenNavHrefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
