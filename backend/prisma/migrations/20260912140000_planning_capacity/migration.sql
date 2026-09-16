-- Master Planning capacity and scenarios (client requirements, Sept 2026).
--
-- Purely additive: one new enum and two new nullable/defaulted columns.
-- Nothing existing is altered or dropped, so an application predating this
-- migration keeps working unchanged.

-- Scenario planning: optimistic / base / pessimistic forecasts held side by side.
CREATE TYPE "ForecastScenario" AS ENUM ('OPTIMISTIC', 'BASE', 'PESSIMISTIC');

ALTER TABLE "demand_forecasts"
  ADD COLUMN "scenario" "ForecastScenario" NOT NULL DEFAULT 'BASE';

-- Equipment class on the vehicle, drawn from the same list the forecast uses,
-- so capacity can be matched to what a corridor actually requires. Nullable:
-- an existing fleet has not been classified yet, and an unclassified truck is
-- deliberately counted against no equipment class rather than against all.
ALTER TABLE "vehicles"
  ADD COLUMN "equipmentType" "EquipmentType";

-- Capacity is always counted per class within one tenant.
CREATE INDEX "vehicles_dataAreaId_equipmentType_idx"
  ON "vehicles"("dataAreaId", "equipmentType");
