-- Expand Order & Trip to the client feature spec. All additive / defaulted.

CREATE TYPE "EquipmentType" AS ENUM ('FLATBED', 'DRY_VAN', 'REEFER', 'TANKER', 'CONTAINER_20FT', 'CONTAINER_40FT', 'CURTAIN_SIDE', 'LTL', 'OTHER');

-- ── Order ──
ALTER TABLE "orders"
  ADD COLUMN "branch" TEXT,
  ADD COLUMN "salesperson" TEXT,
  ADD COLUMN "incoterms" TEXT,
  ADD COLUMN "paymentTerm" "PaymentTerm" NOT NULL DEFAULT 'NET_30',
  ADD COLUMN "shipper" TEXT,
  ADD COLUMN "consignee" TEXT,
  ADD COLUMN "billTo" TEXT,
  ADD COLUMN "notifyParty" TEXT,
  ADD COLUMN "pickupAddress" TEXT,
  ADD COLUMN "deliveryAddress" TEXT,
  ADD COLUMN "pol" TEXT,
  ADD COLUMN "pod" TEXT,
  ADD COLUMN "etd" TIMESTAMP(3),
  ADD COLUMN "eta" TIMESTAMP(3),
  ADD COLUMN "routingNotes" TEXT,
  ADD COLUMN "equipmentType" "EquipmentType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "pieceCount" INTEGER,
  ADD COLUMN "dimensions" TEXT,
  ADD COLUMN "hazmat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hazmatUnCode" TEXT,
  ADD COLUMN "freightRate" DECIMAL(18,2),
  ADD COLUMN "accessorialCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "customerPo" TEXT,
  ADD COLUMN "blNumber" TEXT,
  ADD COLUMN "hsCode" TEXT,
  ADD COLUMN "sealNumber" TEXT,
  ADD COLUMN "specialInstructions" TEXT;

-- ── Trip ──
ALTER TABLE "trips"
  ADD COLUMN "trailerId" TEXT,
  ADD COLUMN "secondDriverId" TEXT,
  ADD COLUMN "actualStart" TIMESTAMP(3),
  ADD COLUMN "actualEnd" TIMESTAMP(3),
  ADD COLUMN "originFacility" TEXT,
  ADD COLUMN "destinationFacility" TEXT,
  ADD COLUMN "viaPoints" TEXT,
  ADD COLUMN "plannedDistanceKm" DECIMAL(12,2),
  ADD COLUMN "routeCode" TEXT,
  ADD COLUMN "waybillNumber" TEXT,
  ADD COLUMN "cargoWeightKg" DECIMAL(12,2),
  ADD COLUMN "packageCount" INTEGER,
  ADD COLUMN "specialHandling" TEXT,
  ADD COLUMN "advancePayment" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "driverWages" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "tollPermitCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "miscExpense" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "fuelType" TEXT,
  ADD COLUMN "fuelCardNumber" TEXT,
  ADD COLUMN "refuelStations" TEXT,
  ADD COLUMN "ewayBillRef" TEXT,
  ADD COLUMN "podStatus" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "podUrl" TEXT,
  ADD COLUMN "sealNumbers" TEXT,
  ADD COLUMN "incidentNotes" TEXT;

CREATE INDEX "trips_secondDriverId_idx" ON "trips"("secondDriverId");
ALTER TABLE "trips" ADD CONSTRAINT "trips_secondDriverId_fkey" FOREIGN KEY ("secondDriverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
