-- Credit & Collections workflow (M7): dunning, disputes, promise-to-pay, write-off,
-- activity log + customer credit fields. Additive / defaulted.

CREATE TYPE "DunningLevel" AS ENUM ('NONE', 'REMINDER', 'FIRST_NOTICE', 'SECOND_NOTICE', 'FINAL_NOTICE', 'LEGAL');
CREATE TYPE "DisputeStatus" AS ENUM ('NONE', 'OPEN', 'UNDER_INVESTIGATION', 'RESOLVED', 'WRITTEN_OFF');
CREATE TYPE "CollectionActivityType" AS ENUM ('CALL', 'EMAIL', 'LETTER', 'DUNNING', 'PROMISE_TO_PAY', 'DISPUTE', 'NOTE', 'WRITE_OFF');

-- ── Customer credit fields ──
ALTER TABLE "customers"
  ADD COLUMN "accountStatus" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "parentAccount" TEXT,
  ADD COLUMN "creditRating" TEXT,
  ADD COLUMN "tempCreditLimit" DECIMAL(18,2),
  ADD COLUMN "creditReviewDate" DATE,
  ADD COLUMN "creditHoldOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dunningLevel" "DunningLevel" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "collectionStrategy" TEXT,
  ADD COLUMN "collectorId" TEXT,
  ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discountDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "penaltyRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "podRequired" BOOLEAN NOT NULL DEFAULT false;

-- ── CustomerInvoice collections fields ──
ALTER TABLE "customer_invoices"
  ADD COLUMN "dunningLevel" "DunningLevel" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "disputeStatus" "DisputeStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "disputedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "promiseToPayDate" DATE,
  ADD COLUMN "promiseToPayAmount" DECIMAL(18,2),
  ADD COLUMN "lastContactDate" DATE,
  ADD COLUMN "writeOffAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
CREATE INDEX "customer_invoices_disputeStatus_idx" ON "customer_invoices"("disputeStatus");

-- ── Collection activity log ──
CREATE TABLE "collection_activities" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "type" "CollectionActivityType" NOT NULL,
    "activityDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "dunningLevel" "DunningLevel",
    "promiseDate" DATE,
    "promiseAmount" DECIMAL(18,2),
    "amount" DECIMAL(18,2),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "collection_activities_dataAreaId_idx" ON "collection_activities"("dataAreaId");
CREATE INDEX "collection_activities_customerId_idx" ON "collection_activities"("customerId");
CREATE INDEX "collection_activities_invoiceId_idx" ON "collection_activities"("invoiceId");

ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_activities" ADD CONSTRAINT "collection_activities_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "customer_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
