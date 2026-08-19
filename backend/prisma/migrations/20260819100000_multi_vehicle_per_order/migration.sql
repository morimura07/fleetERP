-- Multiple vehicles per order (client review).
--
-- A single consignment is routinely dispatched across 10 to 15 trucks, so an
-- order must be able to hold many trips instead of exactly one. Dropping the
-- unique constraint on trips.orderId is what allows that; every existing trip
-- stays valid, since one trip per order is still a legal case.
--
-- Also adds the default driver for a vehicle, used to pre-fill the trip form.
--
-- Safe to apply to a running instance: a constraint is relaxed rather than
-- tightened, and the new column is nullable. Nothing is dropped or rewritten.

-- 1. One order may now have many trips.
DROP INDEX "trips_orderId_key";

-- The unique index was also serving lookups by order; replace it with a plain
-- one so "trips for this order" stays a single index hit.
CREATE INDEX "trips_orderId_idx" ON "trips"("orderId");

-- 2. The driver normally paired with a truck.
ALTER TABLE "vehicles" ADD COLUMN "defaultDriverId" TEXT;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_defaultDriverId_fkey"
    FOREIGN KEY ("defaultDriverId") REFERENCES "drivers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "vehicles_defaultDriverId_idx" ON "vehicles"("defaultDriverId");
