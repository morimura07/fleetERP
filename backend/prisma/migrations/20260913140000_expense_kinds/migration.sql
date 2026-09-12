-- Expense type specialisation (client requirements, Sept 2026, Expenses §3).
--
-- A discriminator plus one nullable group per cost type, rather than five
-- detail tables. The groups are small and always read with the line, so a join
-- per type would buy normalisation and cost every expense query a fan-out.
--
-- Additive: three enums, nineteen columns. `kind` defaults to GENERAL so every
-- existing line stays valid and keeps behaving exactly as before.

CREATE TYPE "ExpenseKind" AS ENUM ('GENERAL', 'FUEL', 'TOLL_PERMIT', 'REPAIR', 'PER_DIEM', 'SUBCONTRACT');
CREATE TYPE "FuelUnit"    AS ENUM ('LITRE', 'GALLON');
CREATE TYPE "PermitType"  AS ENUM ('ROAD_TOLL', 'WEIGHBRIDGE', 'CROSS_BORDER', 'OVERWEIGHT', 'LATRA', 'OTHER');

ALTER TABLE "expense_lines" ADD COLUMN "kind" "ExpenseKind" NOT NULL DEFAULT 'GENERAL';

-- Fuel
ALTER TABLE "expense_lines" ADD COLUMN "fuelVolume"     DECIMAL(12,3);
ALTER TABLE "expense_lines" ADD COLUMN "fuelUnit"       "FuelUnit";
ALTER TABLE "expense_lines" ADD COLUMN "fuelCardNumber" TEXT;
ALTER TABLE "expense_lines" ADD COLUMN "fuelStation"    TEXT;
ALTER TABLE "expense_lines" ADD COLUMN "ratePerUnit"    DECIMAL(12,4);

-- Tolls and permits
ALTER TABLE "expense_lines" ADD COLUMN "gateLocation" TEXT;
ALTER TABLE "expense_lines" ADD COLUMN "permitType"   "PermitType";

-- Repairs and maintenance
ALTER TABLE "expense_lines" ADD COLUMN "serviceOrderId" TEXT;
ALTER TABLE "expense_lines" ADD COLUMN "partsCost"      DECIMAL(18,2);
ALTER TABLE "expense_lines" ADD COLUMN "labourCost"     DECIMAL(18,2);

-- Driver per-diem and advances
ALTER TABLE "expense_lines" ADD COLUMN "travelDays"       INTEGER;
ALTER TABLE "expense_lines" ADD COLUMN "mealAllowance"    DECIMAL(18,2);
ALTER TABLE "expense_lines" ADD COLUMN "lodgingAllowance" DECIMAL(18,2);
ALTER TABLE "expense_lines" ADD COLUMN "advanceDeducted"  DECIMAL(18,2);

-- Subcontracted transport
ALTER TABLE "expense_lines" ADD COLUMN "carrierVendorId" TEXT;
ALTER TABLE "expense_lines" ADD COLUMN "bolReference"    TEXT;
ALTER TABLE "expense_lines" ADD COLUMN "agreedRate"      DECIMAL(18,2);

-- SET NULL on delete: losing the workshop job or the carrier record must not
-- take the cost with it, because the money was still spent.
ALTER TABLE "expense_lines"
  ADD CONSTRAINT "expense_lines_serviceOrderId_fkey"
  FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_lines"
  ADD CONSTRAINT "expense_lines_carrierVendorId_fkey"
  FOREIGN KEY ("carrierVendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "expense_lines_serviceOrderId_idx"  ON "expense_lines"("serviceOrderId");
CREATE INDEX "expense_lines_carrierVendorId_idx" ON "expense_lines"("carrierVendorId");
-- Fuel and per-diem reporting both start by selecting one kind.
CREATE INDEX "expense_lines_kind_idx"            ON "expense_lines"("kind");
