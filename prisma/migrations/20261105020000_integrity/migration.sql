-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "tokenEnc" TEXT;

-- AlterTable
ALTER TABLE "qr_credentials" ADD COLUMN     "tokenEnc" TEXT;

-- CreateIndex
CREATE INDEX "invitations_eventId_eventGuestId_idx" ON "invitations"("eventId", "eventGuestId");

-- CreateIndex
CREATE INDEX "rsvps_invitationId_submittedAt_idx" ON "rsvps"("invitationId", "submittedAt");


-- One active QR credential per invitation.
CREATE UNIQUE INDEX "uq_one_active_credential_per_invitation"
  ON "qr_credentials" ("invitationId") WHERE "status" = 'active';

-- Value constraints (ported from the legacy SQL draft, camelCase columns).
ALTER TABLE "rsvps" ADD CONSTRAINT "ck_rsvps_response" CHECK ("response" IN ('accepted', 'declined', 'pending_clarification'));
ALTER TABLE "rsvps" ADD CONSTRAINT "ck_rsvps_companions" CHECK ("companionCount" >= 0);
ALTER TABLE "event_guests" ADD CONSTRAINT "ck_event_guests_allowance" CHECK ("companionAllowance" >= 0);
ALTER TABLE "event_guests" ADD CONSTRAINT "ck_event_guests_status" CHECK ("guestStatus" IN ('active', 'withdrawn', 'cancelled', 'archived'));
ALTER TABLE "seating_sections" ADD CONSTRAINT "ck_sections_capacity" CHECK ("capacity" >= 0);
ALTER TABLE "protocol_categories" ADD CONSTRAINT "ck_categories_rank" CHECK ("rankOrder" > 0);
ALTER TABLE "seat_assignments" ADD CONSTRAINT "ck_seat_assignments_status" CHECK ("status" IN ('proposed', 'approved', 'released', 'cancelled'));
ALTER TABLE "seat_assignments" ADD CONSTRAINT "ck_seat_assignments_type" CHECK ("assignmentType" IN ('principal', 'companion', 'group_block'));
ALTER TABLE "attendance_records" ADD CONSTRAINT "ck_attendance_status" CHECK ("checkinStatus" IN ('checked_in', 'reversed', 'exception'));
ALTER TABLE "attendance_records" ADD CONSTRAINT "ck_attendance_method" CHECK ("checkinMethod" IN ('qr', 'manual', 'offline_sync', 'supervisor_override', 'fast_track', 'contingency'));
ALTER TABLE "qr_credentials" ADD CONSTRAINT "ck_qr_status" CHECK ("status" IN ('active', 'revoked', 'expired'));
ALTER TABLE "invitations" ADD CONSTRAINT "ck_invitations_status" CHECK ("invitationStatus" IN ('prepared', 'queued', 'sent', 'failed', 'revoked', 'superseded'));
ALTER TABLE "events" ADD CONSTRAINT "ck_events_status" CHECK ("status" IN ('draft', 'setup', 'scheduled', 'active', 'completed', 'archived', 'cancelled'));
