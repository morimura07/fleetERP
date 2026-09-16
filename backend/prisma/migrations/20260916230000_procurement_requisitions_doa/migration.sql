-- Procurement, part A: requisitions, the budget gate and the delegation
-- of authority engine (client requirements, Sept 2026, Procurement §1 and
-- the DOA matrix). Additive: six enums, six tables, one nullable column
-- on purchase_orders linking a PO back to its requisition.

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PENDING_BUDGET', 'PENDING_APPROVAL', 'APPROVED', 'SOURCING', 'ORDERED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BudgetGateStatus" AS ENUM ('NOT_CHECKED', 'WITHIN', 'SOFT_BLOCK', 'HARD_BLOCK', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "DoaMode" AS ENUM ('SEQUENTIAL', 'PARALLEL', 'ANY');

-- CreateEnum
CREATE TYPE "ApprovalSubject" AS ENUM ('REQUISITION', 'AWARD', 'PURCHASE_ORDER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "requisitionId" TEXT;

-- CreateTable
CREATE TABLE "requisitions" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "prNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "costCenter" TEXT,
    "neededBy" DATE,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountBase" DECIMAL(18,2),
    "baseCurrency" TEXT,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "justification" TEXT,
    "requestedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "budgetStatus" "BudgetGateStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "budgetNote" TEXT,
    "budgetOverrideById" TEXT,
    "budgetOverrideAt" TIMESTAMP(3),
    "budgetOverrideNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_lines" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "stockItemId" TEXT,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PIECE',
    "quantity" DECIMAL(18,3) NOT NULL,
    "estUnitPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expenseCode" TEXT NOT NULL DEFAULT '5100',
    "specification" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doa_tiers" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "name" TEXT NOT NULL,
    "minAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "maxAmount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "approverRoles" TEXT[],
    "mode" "DoaMode" NOT NULL DEFAULT 'SEQUENTIAL',
    "minSignatures" INTEGER NOT NULL DEFAULT 1,
    "requiresBudgetSignOff" BOOLEAN NOT NULL DEFAULT false,
    "requiresBidSummary" BOOLEAN NOT NULL DEFAULT false,
    "autoRelease" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doa_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "subjectType" "ApprovalSubject" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "amountBase" DECIMAL(18,2) NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,6),
    "tierId" TEXT,
    "tierName" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "roleKey" TEXT NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "userName" TEXT,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_policies" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL,
    "minQuotes" INTEGER NOT NULL DEFAULT 3,
    "priceTolerancePct" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "quantityTolerancePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "overDeliveryTolerancePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "retriggerVariancePct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "retriggerVarianceAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "poTurnaroundSlaDays" INTEGER NOT NULL DEFAULT 2,
    "shippingDocsBeforeGrn" BOOLEAN NOT NULL DEFAULT true,
    "thresholdCurrency" TEXT NOT NULL DEFAULT 'USD',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requisitions_dataAreaId_status_idx" ON "requisitions"("dataAreaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "requisitions_dataAreaId_prNumber_key" ON "requisitions"("dataAreaId", "prNumber");

-- CreateIndex
CREATE INDEX "requisition_lines_requisitionId_idx" ON "requisition_lines"("requisitionId");

-- CreateIndex
CREATE INDEX "requisition_lines_stockItemId_idx" ON "requisition_lines"("stockItemId");

-- CreateIndex
CREATE INDEX "doa_tiers_dataAreaId_sortOrder_idx" ON "doa_tiers"("dataAreaId", "sortOrder");

-- CreateIndex
CREATE INDEX "approval_requests_dataAreaId_status_idx" ON "approval_requests"("dataAreaId", "status");

-- CreateIndex
CREATE INDEX "approval_requests_subjectType_subjectId_idx" ON "approval_requests"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "approval_decisions_requestId_idx" ON "approval_decisions"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_policies_dataAreaId_key" ON "procurement_policies"("dataAreaId");

-- CreateIndex
CREATE INDEX "purchase_orders_requisitionId_idx" ON "purchase_orders"("requisitionId");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "doa_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


