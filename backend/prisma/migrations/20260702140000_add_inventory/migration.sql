-- Inventory (M14): stock items with moving-average valuation + movements ledger.

-- CreateEnum
CREATE TYPE "StockCategory" AS ENUM ('SPARE_PART', 'FUEL', 'TYRE', 'LUBRICANT', 'CONSUMABLE', 'OTHER');
CREATE TYPE "StockUnit" AS ENUM ('PIECE', 'LITRE', 'KG', 'SET', 'METRE', 'BOX');
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StockCategory" NOT NULL DEFAULT 'SPARE_PART',
    "unit" "StockUnit" NOT NULL DEFAULT 'PIECE',
    "glCode" TEXT NOT NULL DEFAULT '1300',
    "expenseCode" TEXT NOT NULL DEFAULT '5100',
    "quantityOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "stockItemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "qtyAfter" DECIMAL(18,3) NOT NULL,
    "avgCostAfter" DECIMAL(18,4) NOT NULL,
    "reference" TEXT,
    "memo" TEXT,
    "postingEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_items_category_idx" ON "stock_items"("category");
CREATE UNIQUE INDEX "stock_items_dataAreaId_code_key" ON "stock_items"("dataAreaId", "code");
CREATE UNIQUE INDEX "stock_movements_postingEntryId_key" ON "stock_movements"("postingEntryId");
CREATE INDEX "stock_movements_stockItemId_idx" ON "stock_movements"("stockItemId");
CREATE INDEX "stock_movements_type_idx" ON "stock_movements"("type");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_postingEntryId_fkey" FOREIGN KEY ("postingEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
