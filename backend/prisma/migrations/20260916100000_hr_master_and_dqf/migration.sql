-- HR master and driver qualification file (client requirements, Sept 2026, HR §1-2).
--
-- Additive: four new enums, five values added to an existing one, one new
-- table, and columns that are all nullable or defaulted.
--
-- ALTER TYPE ... ADD VALUE is placed first and used nowhere in this file.
-- Postgres refuses to use a value in the transaction that created it, so a
-- default or an insert referencing HAZMAT here would fail; this migration only
-- makes the values exist.

ALTER TYPE "DriverDocType" ADD VALUE 'MEDICAL_CERTIFICATE';
ALTER TYPE "DriverDocType" ADD VALUE 'HAZMAT';
ALTER TYPE "DriverDocType" ADD VALUE 'TWIC';
ALTER TYPE "DriverDocType" ADD VALUE 'FORKLIFT';
ALTER TYPE "DriverDocType" ADD VALUE 'DEFENSIVE_DRIVING';

CREATE TYPE "BackgroundCheckStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'CLEARED', 'FLAGGED');
CREATE TYPE "SkillLevel"            AS ENUM ('SKILLED', 'UNSKILLED', 'NON_CITIZEN');
CREATE TYPE "DriverEventKind"       AS ENUM ('ROAD_TEST', 'MVR_CHECK', 'VIOLATION', 'DRUG_ALCOHOL_TEST', 'TRAINING');
CREATE TYPE "DriverEventOutcome"    AS ENUM ('PASS', 'FAIL', 'NEGATIVE', 'POSITIVE', 'REFUSED', 'PENDING', 'NOT_APPLICABLE');

-- ── Employee: personal, contact, guarantor, vetting, employment ─────────────
ALTER TABLE "employees" ADD COLUMN "dateOfBirth"           DATE;
ALTER TABLE "employees" ADD COLUMN "gender"                TEXT;
ALTER TABLE "employees" ADD COLUMN "religion"              TEXT;
ALTER TABLE "employees" ADD COLUMN "nationality"           TEXT;
ALTER TABLE "employees" ADD COLUMN "passportNumber"        TEXT;
ALTER TABLE "employees" ADD COLUMN "phone"                 TEXT;
ALTER TABLE "employees" ADD COLUMN "email"                 TEXT;
ALTER TABLE "employees" ADD COLUMN "address"               TEXT;
ALTER TABLE "employees" ADD COLUMN "emergencyContactName"  TEXT;
ALTER TABLE "employees" ADD COLUMN "emergencyContactPhone" TEXT;
ALTER TABLE "employees" ADD COLUMN "phoneVoucherEligible"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employees" ADD COLUMN "guarantorName"         TEXT;
ALTER TABLE "employees" ADD COLUMN "guarantorContact"      TEXT;
ALTER TABLE "employees" ADD COLUMN "guarantorDetails"      TEXT;
ALTER TABLE "employees" ADD COLUMN "educationLevel"        TEXT;
ALTER TABLE "employees" ADD COLUMN "previousEmployer"      TEXT;
ALTER TABLE "employees" ADD COLUMN "backgroundCheckStatus" "BackgroundCheckStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "employees" ADD COLUMN "backgroundCheckAt"     DATE;
ALTER TABLE "employees" ADD COLUMN "vettingRemarks"        TEXT;
ALTER TABLE "employees" ADD COLUMN "skillLevel"            "SkillLevel";
ALTER TABLE "employees" ADD COLUMN "incrementDate"         DATE;
ALTER TABLE "employees" ADD COLUMN "exitDate"              DATE;

-- ── Driver: fuel card ────────────────────────────────────────────────────────
ALTER TABLE "drivers" ADD COLUMN "fuelCardNumber" TEXT;
ALTER TABLE "drivers" ADD COLUMN "fuelCardIssuer" TEXT;
ALTER TABLE "drivers" ADD COLUMN "fuelCardLimit"  DECIMAL(18,2);

-- ── DriverDocument: examiner ─────────────────────────────────────────────────
ALTER TABLE "driver_documents" ADD COLUMN "issuer" TEXT;

-- ── The qualification file as a log ──────────────────────────────────────────
CREATE TABLE "driver_events" (
  "id"          TEXT NOT NULL,
  "dataAreaId"  TEXT NOT NULL DEFAULT 'HQ01',
  "driverId"    TEXT NOT NULL,
  "kind"        "DriverEventKind" NOT NULL,
  "occurredAt"  DATE NOT NULL,
  "renewalDue"  DATE,
  "title"       TEXT NOT NULL,
  "outcome"     "DriverEventOutcome" NOT NULL DEFAULT 'NOT_APPLICABLE',
  "reference"   TEXT,
  "amount"      DECIMAL(18,2),
  "reason"      TEXT,
  "sapReferral" BOOLEAN NOT NULL DEFAULT false,
  "atFault"     BOOLEAN NOT NULL DEFAULT false,
  "note"        TEXT,
  "version"     INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "driver_events_pkey" PRIMARY KEY ("id")
);

-- A driver's file goes with the driver.
ALTER TABLE "driver_events" ADD CONSTRAINT "driver_events_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "driver_events_dataAreaId_driverId_kind_idx" ON "driver_events"("dataAreaId", "driverId", "kind");
-- Renewal sweeps: "what falls due in the next 30 days", per tenant.
CREATE INDEX "driver_events_dataAreaId_renewalDue_idx"    ON "driver_events"("dataAreaId", "renewalDue");
