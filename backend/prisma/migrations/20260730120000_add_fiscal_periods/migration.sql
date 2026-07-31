-- Fiscal calendar / period-close (M34): per-entity accounting periods. When a
-- month is CLOSED the ledger refuses new postings dated in it. Additive: a month
-- with no row is OPEN, so nothing changes until an admin closes a period.

CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "fiscal_periods" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fiscal_periods_dataAreaId_year_month_key" ON "fiscal_periods"("dataAreaId", "year", "month");
CREATE INDEX "fiscal_periods_dataAreaId_idx" ON "fiscal_periods"("dataAreaId");
CREATE INDEX "fiscal_periods_dataAreaId_status_idx" ON "fiscal_periods"("dataAreaId", "status");
