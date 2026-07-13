-- Retail / POS (M28): over-the-counter sales of stock items. Completing a sale
-- relieves inventory and posts Dr Cash / Cr Retail Revenue and Dr COGS /
-- Cr Inventory. Additive / non-destructive.

CREATE TYPE "PosSaleStatus" AS ENUM ('DRAFT', 'COMPLETED', 'VOID');
CREATE TYPE "PosPaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'CARD');

-- ── Chart-of-accounts entries the POS postings need (HQ01 default entity) ──
INSERT INTO "accounts" ("id", "dataAreaId", "code", "name", "type", "isActive", "version", "createdAt", "updatedAt")
VALUES
  ('acct_pos_rev_hq01', 'HQ01', '4300', 'Retail Sales Revenue', 'INCOME', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('acct_pos_cogs_hq01', 'HQ01', '5300', 'Cost of Goods Sold', 'EXPENSE', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("dataAreaId", "code") DO NOTHING;

-- ── PosSale ──
CREATE TABLE "pos_sales" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "saleNumber" TEXT NOT NULL,
    "customerName" TEXT,
    "paymentMethod" "PosPaymentMethod" NOT NULL DEFAULT 'CASH',
    "status" "PosSaleStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "revenueEntryId" TEXT,
    "cogsEntryId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pos_sales_revenueEntryId_key" ON "pos_sales"("revenueEntryId");
CREATE UNIQUE INDEX "pos_sales_cogsEntryId_key" ON "pos_sales"("cogsEntryId");
CREATE UNIQUE INDEX "pos_sales_dataAreaId_saleNumber_key" ON "pos_sales"("dataAreaId", "saleNumber");
CREATE INDEX "pos_sales_dataAreaId_idx" ON "pos_sales"("dataAreaId");
CREATE INDEX "pos_sales_dataAreaId_status_idx" ON "pos_sales"("dataAreaId", "status");

-- ── PosSaleLine ──
CREATE TABLE "pos_sale_lines" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "saleId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sale_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pos_sale_lines_saleId_idx" ON "pos_sale_lines"("saleId");
CREATE INDEX "pos_sale_lines_stockItemId_idx" ON "pos_sale_lines"("stockItemId");

-- ── Foreign keys ──
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_revenueEntryId_fkey" FOREIGN KEY ("revenueEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_cogsEntryId_fkey" FOREIGN KEY ("cogsEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
