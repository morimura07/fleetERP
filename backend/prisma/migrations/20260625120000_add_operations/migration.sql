-- CreateEnum
CREATE TYPE "DriverDocType" AS ENUM ('LICENSE', 'PASSPORT', 'COMESA_PERMIT', 'YELLOW_FEVER', 'WORK_PERMIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('UNRECONCILED', 'MATCHED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "PositionSource" AS ENUM ('STUB', 'GPS', 'MANUAL');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "comesaPermitExpiry" DATE,
ADD COLUMN     "yellowCardExpiry" DATE,
ADD COLUMN     "fuelTargetKmPerL" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "fuelLitres" DECIMAL(10,2),
ADD COLUMN     "reconStatus" "ReconStatus" NOT NULL DEFAULT 'UNRECONCILED',
ADD COLUMN     "carrierInvoiceRef" TEXT;

-- CreateTable
CREATE TABLE "driver_documents" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "DriverDocType" NOT NULL,
    "number" TEXT,
    "issuedAt" DATE,
    "expiresAt" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_waypoints" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CHECKPOINT',
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gps_waypoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_positions" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "speedKph" DECIMAL(6,2),
    "headingDeg" INTEGER,
    "source" "PositionSource" NOT NULL DEFAULT 'STUB',
    "nearWaypoint" TEXT,
    "pingedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_documents_expiresAt_idx" ON "driver_documents"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "driver_documents_driverId_type_key" ON "driver_documents"("driverId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "gps_waypoints_code_key" ON "gps_waypoints"("code");

-- CreateIndex
CREATE INDEX "gps_waypoints_kind_idx" ON "gps_waypoints"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_positions_vehicleId_key" ON "vehicle_positions"("vehicleId");

-- CreateIndex
CREATE INDEX "trips_reconStatus_idx" ON "trips"("reconStatus");

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_positions" ADD CONSTRAINT "vehicle_positions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
