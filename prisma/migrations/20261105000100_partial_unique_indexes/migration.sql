-- Partial unique indexes. Prisma cannot model these in schema.prisma, so they
-- live only here. scripts/check-indexes.ts fails CI if any goes missing.
-- Never accept a generated migration that drops one of these.

-- A seat can hold only one live (proposed/approved) assignment per plan.
CREATE UNIQUE INDEX "uq_active_seat_assignment"
  ON "seat_assignments" ("seatingPlanId", "seatId")
  WHERE "seatId" IS NOT NULL AND "status" IN ('proposed', 'approved');

-- A guest can hold only one live principal assignment per plan.
CREATE UNIQUE INDEX "uq_active_guest_assignment"
  ON "seat_assignments" ("seatingPlanId", "eventGuestId")
  WHERE "assignmentType" = 'principal' AND "status" IN ('proposed', 'approved');

-- A guest can be checked in only once per event.
CREATE UNIQUE INDEX "uq_one_active_checkin_per_guest"
  ON "attendance_records" ("eventId", "eventGuestId")
  WHERE "checkinStatus" = 'checked_in';
