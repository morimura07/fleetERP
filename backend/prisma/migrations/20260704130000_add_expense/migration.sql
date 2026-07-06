-- Expense management (M23): expense claims with receipts + advance reconciliation.

-- CreateEnum
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'REJECTED');

-- CreateTable
CREATE TABLE "expense_claims" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "claimNumber" TEXT NOT NULL,
    "driverId" TEXT,
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "advanceId" TEXT,
    "advanceAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reconciled" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "postingEntryId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_lines" (
    "id" TEXT NOT NULL,
    "expenseClaimId" TEXT NOT NULL,
    "expenseCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "incurredAt" DATE NOT NULL,
    "receiptUrl" TEXT,

    CONSTRAINT "expense_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_claims_advanceId_key" ON "expense_claims"("advanceId");
CREATE UNIQUE INDEX "expense_claims_postingEntryId_key" ON "expense_claims"("postingEntryId");
CREATE UNIQUE INDEX "expense_claims_dataAreaId_claimNumber_key" ON "expense_claims"("dataAreaId", "claimNumber");
CREATE INDEX "expense_claims_status_idx" ON "expense_claims"("status");
CREATE INDEX "expense_claims_driverId_idx" ON "expense_claims"("driverId");
CREATE INDEX "expense_lines_expenseClaimId_idx" ON "expense_lines"("expenseClaimId");

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "money_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_postingEntryId_fkey" FOREIGN KEY ("postingEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_expenseClaimId_fkey" FOREIGN KEY ("expenseClaimId") REFERENCES "expense_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
