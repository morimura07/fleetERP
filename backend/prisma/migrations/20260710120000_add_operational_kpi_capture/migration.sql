-- Operational KPI capture (Tier C internal): dock events (turnaround), damage
-- reports (damage/claim rate), and customer feedback (CSAT/NPS). Additive.

CREATE TYPE "DockEventKind" AS ENUM ('ARRIVAL', 'DEPARTURE');
CREATE TYPE "DamageStatus" AS ENUM ('REPORTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SETTLED');

-- ── DockEvent ──
CREATE TABLE "dock_events" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "vehicleId" TEXT NOT NULL,
    "tripId" TEXT,
    "facility" TEXT,
    "kind" "DockEventKind" NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dock_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dock_events_dataAreaId_idx" ON "dock_events"("dataAreaId");
CREATE INDEX "dock_events_vehicleId_eventAt_idx" ON "dock_events"("vehicleId", "eventAt");
CREATE INDEX "dock_events_tripId_idx" ON "dock_events"("tripId");

-- ── DamageReport ──
CREATE TABLE "damage_reports" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "orderId" TEXT,
    "tripId" TEXT,
    "reportNumber" TEXT NOT NULL,
    "status" "DamageStatus" NOT NULL DEFAULT 'REPORTED',
    "reportedAt" DATE NOT NULL,
    "cargoValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "damageValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "damage_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "damage_reports_dataAreaId_reportNumber_key" ON "damage_reports"("dataAreaId", "reportNumber");
CREATE INDEX "damage_reports_dataAreaId_idx" ON "damage_reports"("dataAreaId");
CREATE INDEX "damage_reports_dataAreaId_status_idx" ON "damage_reports"("dataAreaId", "status");

-- ── CustomerFeedback ──
CREATE TABLE "customer_feedback" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "csat" INTEGER,
    "nps" INTEGER,
    "comment" TEXT,
    "collectedAt" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_feedback_dataAreaId_idx" ON "customer_feedback"("dataAreaId");
CREATE INDEX "customer_feedback_customerId_idx" ON "customer_feedback"("customerId");

-- ── Foreign keys ──
ALTER TABLE "dock_events" ADD CONSTRAINT "dock_events_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dock_events" ADD CONSTRAINT "dock_events_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
