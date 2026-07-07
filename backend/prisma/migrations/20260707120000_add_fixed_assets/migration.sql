-- Fixed Assets (M20): asset register + straight-line depreciation with ledger postings.

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('VEHICLE', 'EQUIPMENT', 'FURNITURE', 'BUILDING', 'IT', 'OTHER');
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED');

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL DEFAULT 'EQUIPMENT',
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "acquisitionCost" DECIMAL(18,2) NOT NULL,
    "residualValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "acquisitionDate" DATE NOT NULL,
    "inServiceDate" DATE NOT NULL,
    "accumulatedDepreciation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastDepreciatedPeriod" TEXT,
    "assetAccountCode" TEXT NOT NULL DEFAULT '1500',
    "accumDepCode" TEXT NOT NULL DEFAULT '1510',
    "expenseCode" TEXT NOT NULL DEFAULT '5200',
    "disposalDate" DATE,
    "disposalProceeds" DECIMAL(18,2),
    "disposalEntryId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciation_entries" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "fixedAssetId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "bookValueAfter" DECIMAL(18,2) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depreciation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_disposalEntryId_key" ON "fixed_assets"("disposalEntryId");
CREATE UNIQUE INDEX "fixed_assets_dataAreaId_code_key" ON "fixed_assets"("dataAreaId", "code");
CREATE INDEX "fixed_assets_dataAreaId_idx" ON "fixed_assets"("dataAreaId");
CREATE INDEX "fixed_assets_dataAreaId_status_idx" ON "fixed_assets"("dataAreaId", "status");
CREATE UNIQUE INDEX "depreciation_entries_journalEntryId_key" ON "depreciation_entries"("journalEntryId");
CREATE UNIQUE INDEX "depreciation_entries_fixedAssetId_period_key" ON "depreciation_entries"("fixedAssetId", "period");
CREATE INDEX "depreciation_entries_dataAreaId_idx" ON "depreciation_entries"("dataAreaId");
CREATE INDEX "depreciation_entries_fixedAssetId_idx" ON "depreciation_entries"("fixedAssetId");

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_disposalEntryId_fkey" FOREIGN KEY ("disposalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
