-- Asset custody / assignment + warranty schedule (M19). Additive: two nullable
-- warranty columns on fixed_assets and a new asset_assignments table.

ALTER TABLE "fixed_assets" ADD COLUMN "warrantyProvider" TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "warrantyExpiresAt" DATE;

CREATE TABLE "asset_assignments" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT,
    "custodian" TEXT NOT NULL,
    "location" TEXT,
    "assignedAt" DATE NOT NULL,
    "returnedAt" DATE,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_assignments_dataAreaId_idx" ON "asset_assignments"("dataAreaId");
CREATE INDEX "asset_assignments_assetId_idx" ON "asset_assignments"("assetId");
CREATE INDEX "asset_assignments_assetId_returnedAt_idx" ON "asset_assignments"("assetId", "returnedAt");

ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
