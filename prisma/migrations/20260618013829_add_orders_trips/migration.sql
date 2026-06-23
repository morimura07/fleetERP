-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CorridorType" AS ENUM ('NORTHERN', 'CENTRAL', 'DOMESTIC');

-- CreateEnum
CREATE TYPE "TripExpenseType" AS ENUM ('FUEL', 'TOLLS', 'BORDER_FEES', 'DRIVER_ALLOWANCE', 'DEMURRAGE', 'MAINTENANCE', 'OTHER');

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "orderCode" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "originZone" TEXT NOT NULL,
    "destinationZone" TEXT NOT NULL,
    "corridor" "CorridorType" NOT NULL DEFAULT 'DOMESTIC',
    "cargoDescription" TEXT NOT NULL,
    "grossWeightKg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "volumeCbm" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "freightAmount" DECIMAL(18,2) NOT NULL,
    "demurrageAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "bookingDate" DATE NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "tripCode" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "corridor" "CorridorType" NOT NULL DEFAULT 'DOMESTIC',
    "mileageKm" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transitHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_expenses" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" "TripExpenseType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderCode_key" ON "orders"("orderCode");

-- CreateIndex
CREATE UNIQUE INDEX "orders_invoiceEntryId_key" ON "orders"("invoiceEntryId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_clientId_idx" ON "orders"("clientId");

-- CreateIndex
CREATE INDEX "orders_bookingDate_idx" ON "orders"("bookingDate");

-- CreateIndex
CREATE UNIQUE INDEX "trips_tripCode_key" ON "trips"("tripCode");

-- CreateIndex
CREATE UNIQUE INDEX "trips_orderId_key" ON "trips"("orderId");

-- CreateIndex
CREATE INDEX "trips_driverId_scheduledStart_idx" ON "trips"("driverId", "scheduledStart");

-- CreateIndex
CREATE INDEX "trips_vehicleId_scheduledStart_idx" ON "trips"("vehicleId", "scheduledStart");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE UNIQUE INDEX "trip_expenses_entryId_key" ON "trip_expenses"("entryId");

-- CreateIndex
CREATE INDEX "trip_expenses_tripId_idx" ON "trip_expenses"("tripId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoiceEntryId_fkey" FOREIGN KEY ("invoiceEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
