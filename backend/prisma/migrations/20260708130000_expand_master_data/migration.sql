-- Expand master data (Vendor / Customer / Client) to the client feature spec.
-- All additive / defaulted — non-destructive.

-- New enums
CREATE TYPE "PaymentMethod" AS ENUM ('EFT', 'WIRE', 'CHEQUE', 'CASH', 'MOBILE_MONEY', 'FUEL_CARD');
CREATE TYPE "CustomerAccountGroup" AS ENUM ('SOLD_TO', 'SHIP_TO', 'BILL_TO', 'PAYER');
CREATE TYPE "PartyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_HOLD', 'PROSPECT', 'SUSPENDED');

-- Extend VendorGroup with the spec's carrier categories
ALTER TYPE "VendorGroup" ADD VALUE IF NOT EXISTS 'CARRIER';
ALTER TYPE "VendorGroup" ADD VALUE IF NOT EXISTS 'FREIGHT_BROKER';
ALTER TYPE "VendorGroup" ADD VALUE IF NOT EXISTS 'OWNER_OPERATOR';
ALTER TYPE "VendorGroup" ADD VALUE IF NOT EXISTS 'WORKSHOP';

-- ── Vendor ──
ALTER TABLE "vendors"
  ADD COLUMN "operatingName" TEXT,
  ADD COLUMN "searchTerm" TEXT,
  ADD COLUMN "parentCompany" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "branchAddress" TEXT,
  ADD COLUMN "contactPerson" TEXT,
  ADD COLUMN "billingContact" TEXT,
  ADD COLUMN "insurancePolicy" TEXT,
  ADD COLUMN "insuranceExpiry" DATE,
  ADD COLUMN "licenseNumber" TEXT,
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "bankSwift" TEXT,
  ADD COLUMN "bankIban" TEXT,
  ADD COLUMN "mobileMoney" TEXT,
  ADD COLUMN "reconAccount" TEXT,
  ADD COLUMN "scacCode" TEXT,
  ADD COLUMN "mcDotNumber" TEXT,
  ADD COLUMN "equipmentTypes" TEXT,
  ADD COLUMN "fleetSize" INTEGER,
  ADD COLUMN "rateAgreement" TEXT,
  ADD COLUMN "ediEndpoint" TEXT;
CREATE INDEX "vendors_insuranceExpiry_idx" ON "vendors"("insuranceExpiry");

-- ── Customer ──
ALTER TABLE "customers"
  ADD COLUMN "accountGroup" "CustomerAccountGroup" NOT NULL DEFAULT 'SOLD_TO',
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "registrationNo" TEXT,
  ADD COLUMN "searchTerm" TEXT,
  ADD COLUMN "billingAddress" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "country" TEXT DEFAULT 'TZ',
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "latitude" DECIMAL(10,6),
  ADD COLUMN "longitude" DECIMAL(10,6),
  ADD COLUMN "transportZone" TEXT,
  ADD COLUMN "timeZone" TEXT,
  ADD COLUMN "contactPerson" TEXT,
  ADD COLUMN "apContact" TEXT,
  ADD COLUMN "shippingConditions" TEXT,
  ADD COLUMN "meansOfTransport" TEXT,
  ADD COLUMN "dockRestrictions" TEXT,
  ADD COLUMN "hazmatCertified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "incoterms" TEXT,
  ADD COLUMN "paymentTerm" "PaymentTerm" NOT NULL DEFAULT 'NET_30',
  ADD COLUMN "reconAccount" TEXT,
  ADD COLUMN "preferredCarrier" TEXT,
  ADD COLUMN "communicationLang" TEXT;

-- ── Client ──
ALTER TABLE "clients"
  ADD COLUMN "tradeName" TEXT,
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "website" TEXT,
  ADD COLUMN "tin" TEXT,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "paymentTerm" "PaymentTerm" NOT NULL DEFAULT 'NET_30',
  ADD COLUMN "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxExempt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shippingPreferences" TEXT,
  ADD COLUMN "preferredCarriers" TEXT,
  ADD COLUMN "hazmatCertified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "insuranceRequirement" TEXT,
  ADD COLUMN "slaExpiry" DATE,
  ADD COLUMN "accountManager" TEXT;
