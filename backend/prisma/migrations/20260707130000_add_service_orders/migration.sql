-- Service Management (M22): workshop service orders with parts (from Inventory) + labor.

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'POSTED', 'CANCELLED');
CREATE TYPE "ServiceKind" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "service_orders" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "orderNumber" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" "ServiceKind" NOT NULL DEFAULT 'INTERNAL',
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'OPEN',
    "vendorId" TEXT,
    "odometerKm" INTEGER,
    "fault" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "partsCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "postingEntryId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_parts" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "serviceOrderId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "stockMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_labor" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "serviceOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_labor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_postingEntryId_key" ON "service_orders"("postingEntryId");
CREATE UNIQUE INDEX "service_orders_dataAreaId_orderNumber_key" ON "service_orders"("dataAreaId", "orderNumber");
CREATE INDEX "service_orders_dataAreaId_idx" ON "service_orders"("dataAreaId");
CREATE INDEX "service_orders_dataAreaId_status_idx" ON "service_orders"("dataAreaId", "status");
CREATE INDEX "service_orders_vehicleId_idx" ON "service_orders"("vehicleId");
CREATE UNIQUE INDEX "service_parts_stockMovementId_key" ON "service_parts"("stockMovementId");
CREATE INDEX "service_parts_serviceOrderId_idx" ON "service_parts"("serviceOrderId");
CREATE INDEX "service_parts_dataAreaId_idx" ON "service_parts"("dataAreaId");
CREATE INDEX "service_labor_serviceOrderId_idx" ON "service_labor"("serviceOrderId");
CREATE INDEX "service_labor_dataAreaId_idx" ON "service_labor"("dataAreaId");

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_postingEntryId_fkey" FOREIGN KEY ("postingEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_parts" ADD CONSTRAINT "service_parts_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_parts" ADD CONSTRAINT "service_parts_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_labor" ADD CONSTRAINT "service_labor_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
