-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "gateId" TEXT,
ADD COLUMN     "overrideBy" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedBy" TEXT;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "checkinClosesAt" TIMESTAMP(3),
ADD COLUMN     "checkinOpensAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "gates" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fastTrackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_gate_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "user_gate_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_attempts" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "gateId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "eventGuestId" TEXT,
    "result" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gates_eventId_code_key" ON "gates"("eventId", "code");

-- CreateIndex
CREATE INDEX "user_gate_assignments_userId_idx" ON "user_gate_assignments"("userId");

-- CreateIndex
CREATE INDEX "checkin_attempts_eventId_createdAt_idx" ON "checkin_attempts"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "attendance_records_eventId_checkedInAt_idx" ON "attendance_records"("eventId", "checkedInAt");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gates" ADD CONSTRAINT "gates_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gate_assignments" ADD CONSTRAINT "user_gate_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gate_assignments" ADD CONSTRAINT "user_gate_assignments_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "gates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_attempts" ADD CONSTRAINT "checkin_attempts_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

