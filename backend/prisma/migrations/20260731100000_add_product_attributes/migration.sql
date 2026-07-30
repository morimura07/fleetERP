-- Product Information / attribute catalog (M16): definable stock-item attributes
-- (specs) and their per-item values. Additive.

CREATE TYPE "AttributeDataType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'LIST');

CREATE TABLE "product_attributes" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" "AttributeDataType" NOT NULL DEFAULT 'TEXT',
    "unit" TEXT,
    "options" TEXT,
    "category" "StockCategory",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_attributes_dataAreaId_key_key" ON "product_attributes"("dataAreaId", "key");
CREATE INDEX "product_attributes_dataAreaId_idx" ON "product_attributes"("dataAreaId");

CREATE TABLE "stock_item_attributes" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "stockItemId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_item_attributes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_item_attributes_stockItemId_attributeId_key" ON "stock_item_attributes"("stockItemId", "attributeId");
CREATE INDEX "stock_item_attributes_attributeId_idx" ON "stock_item_attributes"("attributeId");

ALTER TABLE "stock_item_attributes" ADD CONSTRAINT "stock_item_attributes_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_item_attributes" ADD CONSTRAINT "stock_item_attributes_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "product_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
