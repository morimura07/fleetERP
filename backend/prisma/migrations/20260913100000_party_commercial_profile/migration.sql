-- Trading-partner commercial profile (client requirements, Sept 2026).
--
-- The document's "Companies" section describes trading partners: shipper,
-- consignee, broker, sub-contractor. Those are Client and Vendor here, not the
-- Company table, whose `code` IS the dataAreaId and which is the tenant
-- boundary. Adding a customer's address to Company would have made a trading
-- partner into a data area.
--
-- Additive throughout: four enums, two tables, and columns that are all
-- nullable or defaulted.

CREATE TYPE "SiteKind"      AS ENUM ('HEADQUARTERS', 'BRANCH', 'WAREHOUSE', 'FACTORY', 'PORT', 'YARD', 'OTHER');
CREATE TYPE "ContactRole"   AS ENUM ('PRIMARY', 'BILLING', 'OPERATIONS', 'CLAIMS', 'OTHER');
CREATE TYPE "TransportMode" AS ENUM ('FTL', 'LTL', 'RAIL', 'OCEAN', 'AIR', 'INTERMODAL');
CREATE TYPE "Incoterm"      AS ENUM ('EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF');

-- ── Client commercial profile ────────────────────────────────────────────────
ALTER TABLE "clients" ADD COLUMN "taxJurisdiction"   TEXT;
ALTER TABLE "clients" ADD COLUMN "bankName"          TEXT;
ALTER TABLE "clients" ADD COLUMN "bankAccountNumber" TEXT;
ALTER TABLE "clients" ADD COLUMN "bankSwift"         TEXT;
ALTER TABLE "clients" ADD COLUMN "bankIban"          TEXT;
ALTER TABLE "clients" ADD COLUMN "preferredModes"    "TransportMode"[];
ALTER TABLE "clients" ADD COLUMN "incoterm"          "Incoterm";
ALTER TABLE "clients" ADD COLUMN "serviceAreas"      TEXT;
ALTER TABLE "clients" ADD COLUMN "deliveryWindows"   TEXT;
ALTER TABLE "clients" ADD COLUMN "safetyRating"      TEXT;
ALTER TABLE "clients" ADD COLUMN "customsBrokerCode" TEXT;
ALTER TABLE "clients" ADD COLUMN "customsBondNumber" TEXT;
ALTER TABLE "clients" ADD COLUMN "portalUrl"         TEXT;
ALTER TABLE "clients" ADD COLUMN "portalUsername"    TEXT;

-- ── Vendor: the gaps Client already covered ──────────────────────────────────
ALTER TABLE "vendors" ADD COLUMN "creditLimit"       DECIMAL(18,2);
ALTER TABLE "vendors" ADD COLUMN "taxJurisdiction"   TEXT;
ALTER TABLE "vendors" ADD COLUMN "safetyRating"      TEXT;
ALTER TABLE "vendors" ADD COLUMN "customsBrokerCode" TEXT;
ALTER TABLE "vendors" ADD COLUMN "customsBondNumber" TEXT;

-- ── Operational locations ────────────────────────────────────────────────────
CREATE TABLE "party_sites" (
  "id"          TEXT NOT NULL,
  "dataAreaId"  TEXT NOT NULL DEFAULT 'HQ01',
  "clientId"    TEXT,
  "vendorId"    TEXT,
  "name"        TEXT NOT NULL,
  "kind"        "SiteKind" NOT NULL DEFAULT 'BRANCH',
  "street"      TEXT,
  "city"        TEXT,
  "region"      TEXT,
  "postalCode"  TEXT,
  "country"     TEXT,
  "phone"       TEXT,
  "email"       TEXT,
  "isPrimary"   BOOLEAN NOT NULL DEFAULT false,
  "notes"       TEXT,
  "version"     INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "party_sites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "party_contacts" (
  "id"         TEXT NOT NULL,
  "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
  "clientId"   TEXT,
  "vendorId"   TEXT,
  "name"       TEXT NOT NULL,
  "title"      TEXT,
  "phone"      TEXT,
  "mobile"     TEXT,
  "email"      TEXT,
  "role"       "ContactRole" NOT NULL DEFAULT 'OTHER',
  "isPrimary"  BOOLEAN NOT NULL DEFAULT false,
  "notifyDeliveryStatus" BOOLEAN NOT NULL DEFAULT false,
  "notifyInvoices"       BOOLEAN NOT NULL DEFAULT false,
  "notes"      TEXT,
  "version"     INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "party_contacts_pkey" PRIMARY KEY ("id")
);

-- A site or contact belongs to exactly one partner. Prisma cannot express this,
-- so it is enforced here: without it a row could belong to both or to neither,
-- and neither case has a meaning.
ALTER TABLE "party_sites" ADD CONSTRAINT "party_sites_one_owner"
  CHECK (("clientId" IS NOT NULL)::int + ("vendorId" IS NOT NULL)::int = 1);
ALTER TABLE "party_contacts" ADD CONSTRAINT "party_contacts_one_owner"
  CHECK (("clientId" IS NOT NULL)::int + ("vendorId" IS NOT NULL)::int = 1);

-- Cascade: an address is meaningless once the partner is gone.
ALTER TABLE "party_sites" ADD CONSTRAINT "party_sites_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_sites" ADD CONSTRAINT "party_sites_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_contacts" ADD CONSTRAINT "party_contacts_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_contacts" ADD CONSTRAINT "party_contacts_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "party_sites_dataAreaId_clientId_idx"    ON "party_sites"("dataAreaId", "clientId");
CREATE INDEX "party_sites_dataAreaId_vendorId_idx"    ON "party_sites"("dataAreaId", "vendorId");
CREATE INDEX "party_contacts_dataAreaId_clientId_idx" ON "party_contacts"("dataAreaId", "clientId");
CREATE INDEX "party_contacts_dataAreaId_vendorId_idx" ON "party_contacts"("dataAreaId", "vendorId");
