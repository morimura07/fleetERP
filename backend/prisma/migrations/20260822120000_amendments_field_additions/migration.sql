-- Field additions from the client amendments document (Erp Features Updates 2,
-- 22 August 2026), section 2 of the agreed triage.
--
-- Everything here is additive: new enums, and nullable or defaulted columns on
-- five existing tables. No column is dropped, renamed or rewritten, so this is
-- safe to apply to the running instance.
--
-- Deliberately NOT stored, because each would go stale the moment an input
-- changes and is cheap to derive on read:
--   damage ratio    = damageValue / cargoValue
--   dwell time      = departure - paired arrival
--   detention flag  = dwell > the free grace period

-- ── New enums ────────────────────────────────────────────────────────────────
CREATE TYPE "IncidentType"  AS ENUM ('TRANSIT_DAMAGE', 'MOISTURE_DAMAGE', 'SHORTAGE_THEFT', 'CONTAMINATION_SPILLAGE', 'ROAD_ACCIDENT', 'OTHER');
CREATE TYPE "IncidentCause" AS ENUM ('DRIVER_NEGLIGENCE', 'POOR_PACKAGING', 'MECHANICAL_FAILURE', 'THIRD_PARTY', 'FORCE_MAJEURE', 'UNDETERMINED');
CREATE TYPE "ClaimStatus"   AS ENUM ('NOT_FILED', 'LODGED', 'UNDER_ASSESSMENT', 'APPROVED', 'RECOVERED', 'REJECTED');
CREATE TYPE "DockActivity"  AS ENUM ('LOADING', 'OFFLOADING', 'CUSTOMS_INSPECTION', 'CROSS_DOCKING', 'OVERNIGHT_STAGING', 'OTHER');
CREATE TYPE "DockSource"    AS ENUM ('MANUAL', 'GEOFENCE', 'GATE_SCANNER', 'MOBILE_APP');
CREATE TYPE "CompanyKind"   AS ENUM ('OPERATING', 'CLIENT', 'VENDOR', 'PARTNER');

-- ── Incident reports (damage_reports) ────────────────────────────────────────
ALTER TABLE "damage_reports"
    ADD COLUMN "clientId"         TEXT,
    ADD COLUMN "vehicleId"        TEXT,
    ADD COLUMN "driverId"         TEXT,
    ADD COLUMN "incidentType"     "IncidentType"  NOT NULL DEFAULT 'TRANSIT_DAMAGE',
    ADD COLUMN "location"         TEXT,
    ADD COLUMN "rootCause"        "IncidentCause" NOT NULL DEFAULT 'UNDETERMINED',
    ADD COLUMN "liableParty"      TEXT,
    ADD COLUMN "insurerName"      TEXT,
    ADD COLUMN "claimNumber"      TEXT,
    ADD COLUMN "claimStatus"      "ClaimStatus"   NOT NULL DEFAULT 'NOT_FILED',
    ADD COLUMN "settlementAmount" DECIMAL(18,2)   NOT NULL DEFAULT 0;

ALTER TABLE "damage_reports"
    ADD CONSTRAINT "damage_reports_clientId_fkey"  FOREIGN KEY ("clientId")  REFERENCES "clients"("id")  ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "damage_reports_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "damage_reports_driverId_fkey"  FOREIGN KEY ("driverId")  REFERENCES "drivers"("id")  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "damage_reports_vehicleId_idx"    ON "damage_reports"("vehicleId");
CREATE INDEX "damage_reports_driverId_idx"     ON "damage_reports"("driverId");
CREATE INDEX "damage_reports_claimStatus_idx"  ON "damage_reports"("dataAreaId", "claimStatus");

-- ── Dock events ──────────────────────────────────────────────────────────────
ALTER TABLE "dock_events"
    ADD COLUMN "driverId"      TEXT,
    ADD COLUMN "trailerNumber" TEXT,
    ADD COLUMN "dockBay"       TEXT,
    ADD COLUMN "activity"      "DockActivity" NOT NULL DEFAULT 'OTHER',
    ADD COLUMN "sealNumber"    TEXT,
    ADD COLUMN "sealIntact"    BOOLEAN,
    ADD COLUMN "odometerKm"    INTEGER,
    ADD COLUMN "fuelLevel"     TEXT,
    ADD COLUMN "source"        "DockSource"   NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "dock_events"
    ADD CONSTRAINT "dock_events_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "dock_events_driverId_idx" ON "dock_events"("driverId");

-- ── Expense claims and lines ────────────────────────────────────────────────
ALTER TABLE "expense_claims"
    ADD COLUMN "costCenter" TEXT,
    ADD COLUMN "branch"     TEXT;

ALTER TABLE "expense_lines"
    ADD COLUMN "postingDate" DATE,
    ADD COLUMN "voucherRef"  TEXT,
    ADD COLUMN "vehicleId"   TEXT,
    ADD COLUMN "tripId"      TEXT,
    ADD COLUMN "odometerKm"  INTEGER,
    ADD COLUMN "taxAmount"   DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "expense_lines"
    ADD CONSTRAINT "expense_lines_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "expense_lines_tripId_fkey"    FOREIGN KEY ("tripId")    REFERENCES "trips"("id")    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "expense_lines_vehicleId_idx" ON "expense_lines"("vehicleId");
CREATE INDEX "expense_lines_tripId_idx"    ON "expense_lines"("tripId");

-- ── Companies ────────────────────────────────────────────────────────────────
ALTER TABLE "companies"
    ADD COLUMN "kind"               "CompanyKind" NOT NULL DEFAULT 'OPERATING',
    ADD COLUMN "registrationNumber" TEXT,
    ADD COLUMN "taxId"              TEXT,
    ADD COLUMN "industry"           TEXT,
    ADD COLUMN "paymentTerm"        "PaymentTerm" NOT NULL DEFAULT 'NET_30',
    ADD COLUMN "creditLimit"        DECIMAL(18,2);

-- ── Demand forecasts ─────────────────────────────────────────────────────────
ALTER TABLE "demand_forecasts"
    ADD COLUMN "clientId"         TEXT,
    ADD COLUMN "contractName"     TEXT,
    ADD COLUMN "cargoType"        TEXT,
    ADD COLUMN "equipmentClass"   "EquipmentType",
    ADD COLUMN "originHub"        TEXT,
    ADD COLUMN "destinationHub"   TEXT,
    ADD COLUMN "turnaroundDays"   DECIMAL(6,2),
    ADD COLUMN "projectedRevenue" DECIMAL(18,2);

ALTER TABLE "demand_forecasts"
    ADD CONSTRAINT "demand_forecasts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "demand_forecasts_clientId_idx" ON "demand_forecasts"("clientId");
