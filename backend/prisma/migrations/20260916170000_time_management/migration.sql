-- Time management (client requirements, Sept 2026, Time Management section).
--
-- Shift codes and a roster, tasks inside a shift with time and place, the
-- punch locations and methods the document names, and a per-company working
-- time policy that the pay split and hours-of-service checks read from.
-- Additive throughout: one enum, two enum values, five tables, and columns
-- that are all nullable or defaulted.

-- CreateEnum
CREATE TYPE "ShiftActivityKind" AS ENUM ('DRIVING', 'LOADING', 'UNLOADING', 'REFUELING', 'BORDER_CROSSING', 'INSPECTION', 'WAITING', 'BREAK', 'REST', 'YARD_MOVE', 'OTHER');

-- AlterEnum (new values first; nothing in this file uses them)
ALTER TYPE "AttendanceSource" ADD VALUE 'RFID';
ALTER TYPE "AttendanceSource" ADD VALUE 'EVV';

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "clockInLat" DECIMAL(9,6),
ADD COLUMN     "clockInLng" DECIMAL(9,6),
ADD COLUMN     "clockInPlace" TEXT,
ADD COLUMN     "clockOutLat" DECIMAL(9,6),
ADD COLUMN     "clockOutLng" DECIMAL(9,6),
ADD COLUMN     "clockOutPlace" TEXT,
ADD COLUMN     "scheduledEnd" TIMESTAMP(3),
ADD COLUMN     "scheduledStart" TIMESTAMP(3),
ADD COLUMN     "shiftCodeId" TEXT,
ADD COLUMN     "tripId" TEXT,
ADD COLUMN     "vehicleId" TEXT;

-- AlterTable
ALTER TABLE "timesheets" ADD COLUMN     "breakHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "drivingHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hourlyRate" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nightHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nightPay" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "premiumHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "premiumPay" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shiftAllowances" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "waitingHours" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "shift_codes" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isNight" BOOLEAN NOT NULL DEFAULT false,
    "shiftAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_entries" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftCodeId" TEXT NOT NULL,
    "tripId" TEXT,
    "vehicleId" TEXT,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_activities" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "timeEntryId" TEXT NOT NULL,
    "kind" "ShiftActivityKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "place" TEXT,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_policies" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL,
    "standardDailyHours" DECIMAL(5,2) NOT NULL DEFAULT 9,
    "standardWeeklyHours" DECIMAL(5,2) NOT NULL DEFAULT 45,
    "overtimeMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "restDayMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "nightPremiumPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "restDays" TEXT NOT NULL DEFAULT 'SUN',
    "nightStart" TEXT NOT NULL DEFAULT '22:00',
    "nightEnd" TEXT NOT NULL DEFAULT '06:00',
    "standardMonthlyHours" DECIMAL(6,2) NOT NULL DEFAULT 195,
    "maxDrivingHoursPerShift" DECIMAL(5,2) NOT NULL DEFAULT 9,
    "maxDutyHoursPerShift" DECIMAL(5,2) NOT NULL DEFAULT 13,
    "breakAfterDrivingHours" DECIMAL(5,2) NOT NULL DEFAULT 4.5,
    "minBreakMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxWeeklyDutyHours" DECIMAL(5,2) NOT NULL DEFAULT 60,
    "warnBeforeLimitHours" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "source" TEXT,
    "verifiedAt" DATE,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_codes_dataAreaId_code_key" ON "shift_codes"("dataAreaId", "code");

-- CreateIndex
CREATE INDEX "roster_entries_dataAreaId_date_idx" ON "roster_entries"("dataAreaId", "date");

-- CreateIndex
CREATE INDEX "roster_entries_shiftCodeId_idx" ON "roster_entries"("shiftCodeId");

-- CreateIndex
CREATE INDEX "roster_entries_tripId_idx" ON "roster_entries"("tripId");

-- CreateIndex
CREATE INDEX "roster_entries_vehicleId_idx" ON "roster_entries"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_entries_employeeId_date_key" ON "roster_entries"("employeeId", "date");

-- CreateIndex
CREATE INDEX "shift_activities_timeEntryId_idx" ON "shift_activities"("timeEntryId");

-- CreateIndex
CREATE INDEX "shift_activities_dataAreaId_startedAt_idx" ON "shift_activities"("dataAreaId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_dataAreaId_date_key" ON "public_holidays"("dataAreaId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "time_policies_dataAreaId_key" ON "time_policies"("dataAreaId");

-- CreateIndex
CREATE INDEX "time_entries_shiftCodeId_idx" ON "time_entries"("shiftCodeId");

-- CreateIndex
CREATE INDEX "time_entries_tripId_idx" ON "time_entries"("tripId");

-- CreateIndex
CREATE INDEX "time_entries_vehicleId_idx" ON "time_entries"("vehicleId");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_shiftCodeId_fkey" FOREIGN KEY ("shiftCodeId") REFERENCES "shift_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_shiftCodeId_fkey" FOREIGN KEY ("shiftCodeId") REFERENCES "shift_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_activities" ADD CONSTRAINT "shift_activities_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;


