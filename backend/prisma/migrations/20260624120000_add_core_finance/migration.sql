-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('SPOT', 'AVERAGE', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('BANK', 'MOBILE_MONEY', 'CASH');

-- CreateEnum
CREATE TYPE "DisbursementType" AS ENUM ('FUEL_ALLOWANCE', 'TOLLS', 'BORDER_FEES', 'EMERGENCY_REPAIR', 'DRIVER_ADVANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "BudgetKind" AS ENUM ('CAPEX', 'OPEX');

-- CreateEnum
CREATE TYPE "BudgetControl" AS ENUM ('STRICT_BLOCK', 'WARNING_ONLY', 'OVERRIDE');

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "currency" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "rateType" "RateType" NOT NULL DEFAULT 'SPOT',
    "rate" DECIMAL(18,6) NOT NULL,
    "validFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BankAccountType" NOT NULL DEFAULT 'BANK',
    "glCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "iban" TEXT,
    "swift" TEXT,
    "provider" TEXT,
    "accountNo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_transfers" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "reference" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "driverId" TEXT,
    "type" "DisbursementType" NOT NULL DEFAULT 'OTHER',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "expenseCode" TEXT NOT NULL DEFAULT '5030',
    "externalRef" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "transferredAt" DATE NOT NULL,
    "memo" TEXT,
    "entryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "money_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "name" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "control" "BudgetControl" NOT NULL DEFAULT 'WARNING_ONLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "kind" "BudgetKind" NOT NULL DEFAULT 'OPEX',
    "costCenter" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "consumed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consolidation_maps" (
    "id" TEXT NOT NULL,
    "parentArea" TEXT NOT NULL DEFAULT 'HQ01',
    "subsidiary" TEXT NOT NULL,
    "subAccount" TEXT NOT NULL,
    "parentAccount" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consolidation_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_dataAreaId_currency_rateType_idx" ON "exchange_rates"("dataAreaId", "currency", "rateType");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_dataAreaId_currency_baseCurrency_rateType_val_key" ON "exchange_rates"("dataAreaId", "currency", "baseCurrency", "rateType", "validFrom");

-- CreateIndex
CREATE INDEX "bank_accounts_type_idx" ON "bank_accounts"("type");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_dataAreaId_code_key" ON "bank_accounts"("dataAreaId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "money_transfers_entryId_key" ON "money_transfers"("entryId");

-- CreateIndex
CREATE INDEX "money_transfers_bankAccountId_idx" ON "money_transfers"("bankAccountId");

-- CreateIndex
CREATE INDEX "money_transfers_driverId_idx" ON "money_transfers"("driverId");

-- CreateIndex
CREATE INDEX "money_transfers_status_idx" ON "money_transfers"("status");

-- CreateIndex
CREATE INDEX "budgets_fiscalYear_idx" ON "budgets"("fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_dataAreaId_fiscalYear_name_key" ON "budgets"("dataAreaId", "fiscalYear", "name");

-- CreateIndex
CREATE INDEX "budget_lines_budgetId_idx" ON "budget_lines"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budgetId_costCenter_accountCode_key" ON "budget_lines"("budgetId", "costCenter", "accountCode");

-- CreateIndex
CREATE INDEX "consolidation_maps_parentArea_subsidiary_idx" ON "consolidation_maps"("parentArea", "subsidiary");

-- CreateIndex
CREATE UNIQUE INDEX "consolidation_maps_parentArea_subsidiary_subAccount_key" ON "consolidation_maps"("parentArea", "subsidiary", "subAccount");

-- AddForeignKey
ALTER TABLE "money_transfers" ADD CONSTRAINT "money_transfers_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transfers" ADD CONSTRAINT "money_transfers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transfers" ADD CONSTRAINT "money_transfers_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transfers" ADD CONSTRAINT "money_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
