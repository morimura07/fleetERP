-- Master Planning (M33): planner-entered demand forecasts per period + corridor.
-- The capacity plan (demand vs live fleet/driver availability) is computed, not
-- stored. Additive / non-destructive.

CREATE TYPE "ForecastStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ARCHIVED');

CREATE TABLE "demand_forecasts" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "period" TEXT NOT NULL,
    "corridor" "CorridorType" NOT NULL DEFAULT 'DOMESTIC',
    "status" "ForecastStatus" NOT NULL DEFAULT 'DRAFT',
    "forecastLoads" INTEGER NOT NULL DEFAULT 0,
    "forecastTonnes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "plannedTrucks" INTEGER,
    "plannedDrivers" INTEGER,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demand_forecasts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "demand_forecasts_dataAreaId_period_corridor_key" ON "demand_forecasts"("dataAreaId", "period", "corridor");
CREATE INDEX "demand_forecasts_dataAreaId_idx" ON "demand_forecasts"("dataAreaId");
CREATE INDEX "demand_forecasts_dataAreaId_period_idx" ON "demand_forecasts"("dataAreaId", "period");
CREATE INDEX "demand_forecasts_dataAreaId_status_idx" ON "demand_forecasts"("dataAreaId", "status");
