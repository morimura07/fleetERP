-- Consolidation to IAS 21 (client requirements, Sept 2026, Consolidation section).
--
-- A mapping row now says which rate translates its account and whether it
-- is an intercompany balance; a subsidiary has an ownership share and a CTA
-- account; and a consolidation is a saved run with a status and a snapshot
-- of every line, so a posted run can be explained after the ledgers change.
-- Additive throughout. The audit columns added to consolidation_maps carry
-- defaults so existing rows are kept.

-- CreateEnum
CREATE TYPE "ConsolidationStatus" AS ENUM ('DRAFT', 'SIMULATED', 'POSTED');

-- AlterTable
ALTER TABLE "consolidation_maps" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "icPartner" TEXT,
ADD COLUMN     "intercompany" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "rateType" "RateType",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedById" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "consolidation_entities" (
    "id" TEXT NOT NULL,
    "parentArea" TEXT NOT NULL DEFAULT 'HQ01',
    "subsidiary" TEXT NOT NULL,
    "sharePct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "ctaAccount" TEXT NOT NULL DEFAULT '3900',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consolidation_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consolidation_runs" (
    "id" TEXT NOT NULL,
    "parentArea" TEXT NOT NULL DEFAULT 'HQ01',
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "period" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "subsidiaries" TEXT[],
    "status" "ConsolidationStatus" NOT NULL DEFAULT 'DRAFT',
    "ranAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "postingEntryId" TEXT,
    "warnings" JSONB,
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consolidation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consolidation_run_lines" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "subsidiary" TEXT NOT NULL,
    "subAccount" TEXT NOT NULL,
    "subAccountName" TEXT NOT NULL,
    "parentAccount" TEXT NOT NULL,
    "parentAccountName" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "currency" TEXT NOT NULL,
    "rateType" "RateType" NOT NULL,
    "rate" DECIMAL(18,6),
    "beginningLocal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "debitLocal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditLocal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "endingLocal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "beginningBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "activityBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "endingBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "eliminationBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sharePct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "consolidatedBase" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "intercompany" BOOLEAN NOT NULL DEFAULT false,
    "isCta" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "consolidation_run_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consolidation_entities_parentArea_subsidiary_key" ON "consolidation_entities"("parentArea", "subsidiary");

-- CreateIndex
CREATE UNIQUE INDEX "consolidation_runs_postingEntryId_key" ON "consolidation_runs"("postingEntryId");

-- CreateIndex
CREATE INDEX "consolidation_runs_parentArea_period_idx" ON "consolidation_runs"("parentArea", "period");

-- CreateIndex
CREATE INDEX "consolidation_runs_parentArea_status_idx" ON "consolidation_runs"("parentArea", "status");

-- CreateIndex
CREATE INDEX "consolidation_run_lines_runId_idx" ON "consolidation_run_lines"("runId");

-- AddForeignKey
ALTER TABLE "consolidation_runs" ADD CONSTRAINT "consolidation_runs_postingEntryId_fkey" FOREIGN KEY ("postingEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_run_lines" ADD CONSTRAINT "consolidation_run_lines_runId_fkey" FOREIGN KEY ("runId") REFERENCES "consolidation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


