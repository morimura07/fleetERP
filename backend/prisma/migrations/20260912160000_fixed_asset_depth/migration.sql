-- Fixed asset register depth (client requirements, Sept 2026).
--
-- Purely additive: three new enums and thirty new columns, every one of them
-- either nullable or defaulted. Nothing existing is altered or dropped, and the
-- two columns that are NOT NULL carry a default, so existing rows are valid the
-- moment they are added.

CREATE TYPE "MeterUnit" AS ENUM ('KILOMETRES', 'HOURS');
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'UNITS_OF_PRODUCTION');
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'USED', 'RECONDITIONED');

-- §1 Identification
ALTER TABLE "fixed_assets" ADD COLUMN "assetGroup"      TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "inventoryNumber" TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "serialNumber"    TEXT;

-- §2 Operational specification
ALTER TABLE "fixed_assets" ADD COLUMN "registrationNumber" TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "make"               TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "model"              TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "yearMade"           INTEGER;
ALTER TABLE "fixed_assets" ADD COLUMN "fuelType"           TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "standardKmPerL"     DECIMAL(8,2);
ALTER TABLE "fixed_assets" ADD COLUMN "capacity"           TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "meterReading"       DECIMAL(12,2);
ALTER TABLE "fixed_assets" ADD COLUMN "meterUnit"          "MeterUnit";
ALTER TABLE "fixed_assets" ADD COLUMN "telematicsUnitId"   TEXT;

-- §3 Acquisition
ALTER TABLE "fixed_assets" ADD COLUMN "vendorId"           TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "purchaseOrderId"    TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "capitalizationDate" DATE;

-- §4 Depreciation parameters
ALTER TABLE "fixed_assets" ADD COLUMN "depreciationMethod"    "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE';
ALTER TABLE "fixed_assets" ADD COLUMN "decliningRatePct"      DECIMAL(6,2);
ALTER TABLE "fixed_assets" ADD COLUMN "totalExpectedUnits"    DECIMAL(14,2);
ALTER TABLE "fixed_assets" ADD COLUMN "unitsProduced"         DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "fixed_assets" ADD COLUMN "depreciationStartDate" DATE;

-- §5 Assignment and location
ALTER TABLE "fixed_assets" ADD COLUMN "costCenter" TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "location"   TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "projectId"  TEXT;

-- §6 Compliance and insurance
ALTER TABLE "fixed_assets" ADD COLUMN "insuranceProvider"     TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "insurancePolicyNumber" TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "insuredValue"          DECIMAL(18,2);
ALTER TABLE "fixed_assets" ADD COLUMN "insuranceExpiresAt"    DATE;
ALTER TABLE "fixed_assets" ADD COLUMN "inspectionDueAt"       DATE;

-- §7 Origin
ALTER TABLE "fixed_assets" ADD COLUMN "condition" "AssetCondition" NOT NULL DEFAULT 'NEW';

-- Links to who supplied it, what bought it and what it serves. SET NULL on
-- delete throughout: losing a vendor record must not take the asset with it.
ALTER TABLE "fixed_assets"
  ADD CONSTRAINT "fixed_assets_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fixed_assets"
  ADD CONSTRAINT "fixed_assets_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fixed_assets"
  ADD CONSTRAINT "fixed_assets_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "fixed_assets_vendorId_idx"        ON "fixed_assets"("vendorId");
CREATE INDEX "fixed_assets_purchaseOrderId_idx" ON "fixed_assets"("purchaseOrderId");
CREATE INDEX "fixed_assets_projectId_idx"       ON "fixed_assets"("projectId");
-- Expiry sweeps: "what is due in the next 30 days", per tenant.
CREATE INDEX "fixed_assets_dataAreaId_insuranceExpiresAt_idx" ON "fixed_assets"("dataAreaId", "insuranceExpiresAt");
CREATE INDEX "fixed_assets_dataAreaId_inspectionDueAt_idx"    ON "fixed_assets"("dataAreaId", "inspectionDueAt");
