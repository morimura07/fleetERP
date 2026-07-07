-- Multi-company (M34): Company registry + partition operational data by dataAreaId.

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "country" TEXT NOT NULL DEFAULT 'TZ',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- Seed the default legal entity so existing data stays valid.
INSERT INTO "companies" ("id", "code", "name", "baseCurrency", "country", "updatedAt")
VALUES ('cmp_hq01_default', 'HQ01', 'Head Office', 'USD', 'TZ', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Partition operational models: add dataAreaId (defaults to HQ01 for existing rows) + index.
ALTER TABLE "drivers" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "vehicles" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "clients" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "delivery_jobs" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "dispatches" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "daily_reports" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "vehicle_maintenances" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "driver_availabilities" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "holidays" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "driver_documents" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "gps_waypoints" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';
ALTER TABLE "vehicle_positions" ADD COLUMN "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01';

CREATE INDEX "drivers_dataAreaId_idx" ON "drivers"("dataAreaId");
CREATE INDEX "vehicles_dataAreaId_idx" ON "vehicles"("dataAreaId");
CREATE INDEX "clients_dataAreaId_idx" ON "clients"("dataAreaId");
CREATE INDEX "delivery_jobs_dataAreaId_idx" ON "delivery_jobs"("dataAreaId");
CREATE INDEX "dispatches_dataAreaId_idx" ON "dispatches"("dataAreaId");
CREATE INDEX "daily_reports_dataAreaId_idx" ON "daily_reports"("dataAreaId");
CREATE INDEX "vehicle_maintenances_dataAreaId_idx" ON "vehicle_maintenances"("dataAreaId");
CREATE INDEX "driver_availabilities_dataAreaId_idx" ON "driver_availabilities"("dataAreaId");
CREATE INDEX "holidays_dataAreaId_idx" ON "holidays"("dataAreaId");
CREATE INDEX "driver_documents_dataAreaId_idx" ON "driver_documents"("dataAreaId");
CREATE INDEX "gps_waypoints_dataAreaId_idx" ON "gps_waypoints"("dataAreaId");
CREATE INDEX "vehicle_positions_dataAreaId_idx" ON "vehicle_positions"("dataAreaId");
