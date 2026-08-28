-- Link a fixed asset to the vehicle it represents.
--
-- Without this, a truck's depreciation cannot be attributed to that truck, so
-- the fleet dashboard could only report operating cost rather than true total
-- cost of ownership (the client's July KPI spec asks for depreciation).
--
-- One asset per vehicle, so the column is UNIQUE. Nullable, because most assets
-- are not vehicles and existing rows have no link.
--
-- Safe to apply to a running instance: the column is nullable and nothing is
-- rewritten.

ALTER TABLE "fixed_assets" ADD COLUMN "vehicleId" TEXT;

CREATE UNIQUE INDEX "fixed_assets_vehicleId_key" ON "fixed_assets"("vehicleId");

ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
