-- Expand Driver / Vehicle / StockItem / Warehouse / Employee / User / GpsWaypoint
-- to the client feature spec. All additive / defaulted — non-destructive.

CREATE TYPE "DriverType" AS ENUM ('COMPANY', 'OWNER_OPERATOR', 'SUBCONTRACTOR');
CREATE TYPE "OwnershipStatus" AS ENUM ('OWNED', 'LEASED', 'SUBCONTRACTED');
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID', 'CNG', 'OTHER');
CREATE TYPE "FacilityType" AS ENUM ('DISTRIBUTION_CENTER', 'CROSS_DOCK', 'TRANSIT_HUB', 'BONDED_WAREHOUSE', 'YARD', 'OTHER');

-- ── Driver ──
ALTER TABLE "drivers"
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "altPhone" TEXT,
  ADD COLUMN "homeTerminal" TEXT,
  ADD COLUMN "emergencyContact" TEXT,
  ADD COLUMN "licenseNumber" TEXT,
  ADD COLUMN "licenseClass" TEXT,
  ADD COLUMN "licenseExpiry" DATE,
  ADD COLUMN "medicalCertExpiry" DATE,
  ADD COLUMN "passportNumber" TEXT,
  ADD COLUMN "passportExpiry" DATE,
  ADD COLUMN "driverType" "DriverType" NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "terminationDate" DATE,
  ADD COLUMN "payScale" TEXT,
  ADD COLUMN "taxId" TEXT,
  ADD COLUMN "eldId" TEXT,
  ADD COLUMN "hosCycleRule" TEXT,
  ADD COLUMN "terminalTimeZone" TEXT,
  ADD COLUMN "assignedVehicle" TEXT,
  ADD COLUMN "cargoQualifications" TEXT,
  ADD COLUMN "languagePref" TEXT;

-- ── Vehicle ──
ALTER TABLE "vehicles"
  ADD COLUMN "vin" TEXT,
  ADD COLUMN "yearMade" INTEGER,
  ADD COLUMN "vehicleType" TEXT,
  ADD COLUMN "bodyType" TEXT,
  ADD COLUMN "tareWeightKg" DECIMAL(12,2),
  ADD COLUMN "gvwKg" DECIMAL(12,2),
  ADD COLUMN "payloadKg" DECIMAL(12,2),
  ADD COLUMN "loadingVolumeCbm" DECIMAL(12,2),
  ADD COLUMN "dimensions" TEXT,
  ADD COLUMN "axleCount" INTEGER,
  ADD COLUMN "suspensionType" TEXT,
  ADD COLUMN "registrationExpiry" DATE,
  ADD COLUMN "insurancePolicyNo" TEXT,
  ADD COLUMN "emissionRating" TEXT,
  ADD COLUMN "operatingPermit" TEXT,
  ADD COLUMN "ownershipStatus" "OwnershipStatus" NOT NULL DEFAULT 'OWNED',
  ADD COLUMN "transporterName" TEXT,
  ADD COLUMN "fuelType" "FuelType",
  ADD COLUMN "fuelCardNumber" TEXT,
  ADD COLUMN "telematicsId" TEXT,
  ADD COLUMN "homeTerminal" TEXT,
  ADD COLUMN "assignedDriver" TEXT,
  ADD COLUMN "odometerKm" INTEGER,
  ADD COLUMN "engineNumber" TEXT,
  ADD COLUMN "tyreSize" TEXT,
  ADD COLUMN "batterySpec" TEXT,
  ADD COLUMN "lastServiceDate" DATE,
  ADD COLUMN "lastServiceKm" INTEGER,
  ADD COLUMN "assetAccountCode" TEXT,
  ADD COLUMN "purchaseDate" DATE,
  ADD COLUMN "purchasePrice" DECIMAL(18,2),
  ADD COLUMN "depreciationMethod" TEXT;

-- ── StockItem ──
ALTER TABLE "stock_items"
  ADD COLUMN "oemPartNumber" TEXT,
  ADD COLUMN "supplierPartNumber" TEXT,
  ADD COLUMN "applicableFleet" TEXT,
  ADD COLUMN "partCondition" TEXT,
  ADD COLUMN "assetSerialNo" TEXT,
  ADD COLUMN "hazmat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "standardCost" DECIMAL(18,4),
  ADD COLUMN "lastPurchasePrice" DECIMAL(18,4),
  ADD COLUMN "defaultVendor" TEXT,
  ADD COLUMN "taxCode" TEXT,
  ADD COLUMN "valuationMethod" TEXT DEFAULT 'AVERAGE',
  ADD COLUMN "storageLocation" TEXT,
  ADD COLUMN "binRack" TEXT,
  ADD COLUMN "batchLot" TEXT,
  ADD COLUMN "manufactureDate" DATE,
  ADD COLUMN "expiryDate" DATE,
  ADD COLUMN "maxStockLevel" DECIMAL(18,3),
  ADD COLUMN "safetyStock" DECIMAL(18,3),
  ADD COLUMN "leadTimeDays" INTEGER,
  ADD COLUMN "economicOrderQty" DECIMAL(18,3),
  ADD COLUMN "warrantyPeriod" TEXT,
  ADD COLUMN "warrantyStart" DATE,
  ADD COLUMN "qualityStatus" TEXT;

-- ── Warehouse ──
ALTER TABLE "warehouses"
  ADD COLUMN "facilityType" "FacilityType" NOT NULL DEFAULT 'DISTRIBUTION_CENTER',
  ADD COLUMN "timeZone" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "country" TEXT DEFAULT 'TZ',
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "latitude" DECIMAL(10,6),
  ADD COLUMN "longitude" DECIMAL(10,6),
  ADD COLUMN "managerName" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "dockCapacity" INTEGER,
  ADD COLUMN "dockScheduling" TEXT,
  ADD COLUMN "operatingHours" TEXT,
  ADD COLUMN "storageTypes" TEXT,
  ADD COLUMN "capacityLimit" TEXT,
  ADD COLUMN "putawayStrategy" TEXT,
  ADD COLUMN "pickingStrategy" TEXT,
  ADD COLUMN "countMethod" TEXT;

-- ── Employee ──
ALTER TABLE "employees"
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "employmentType" TEXT,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "costCenter" TEXT,
  ADD COLUMN "payFrequency" TEXT,
  ADD COLUMN "nssfNumber" TEXT,
  ADD COLUMN "shifNumber" TEXT,
  ADD COLUMN "perDiem" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "overnightAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "phoneAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "otherAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- ── User ──
ALTER TABLE "users"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "assignedBranch" TEXT,
  ADD COLUMN "costCenter" TEXT,
  ADD COLUMN "approvalLimit" DECIMAL(18,2),
  ADD COLUMN "esignatory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "languagePref" TEXT,
  ADD COLUMN "timeZone" TEXT;

-- ── GpsWaypoint ──
ALTER TABLE "gps_waypoints"
  ADD COLUMN "altitude" DECIMAL(9,2),
  ADD COLUMN "locationType" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "geofenceRadius" INTEGER,
  ADD COLUMN "timeZone" TEXT,
  ADD COLUMN "contactDetails" TEXT,
  ADD COLUMN "serviceTimeMin" INTEGER,
  ADD COLUMN "requiredEquipment" TEXT,
  ADD COLUMN "accessRestrictions" TEXT,
  ADD COLUMN "sequenceNo" INTEGER;
