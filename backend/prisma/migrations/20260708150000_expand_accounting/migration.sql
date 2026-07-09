-- Expand Account (COA) & Journal to the client feature spec. Additive / defaulted.

CREATE TYPE "AccountSubType" AS ENUM ('CURRENT_ASSET', 'FIXED_ASSET', 'CURRENT_LIABILITY', 'LONG_TERM_LIABILITY', 'EQUITY', 'OPERATING_REVENUE', 'OTHER_REVENUE', 'COST_OF_SALES', 'OPERATING_EXPENSE', 'OTHER_EXPENSE', 'NONE');
CREATE TYPE "PostingType" AS ENUM ('POSTABLE', 'HEADER', 'CONTROL');
CREATE TYPE "JournalDocType" AS ENUM ('GENERAL', 'ACCRUAL', 'DEPRECIATION', 'CASH_DISBURSEMENT', 'CASH_RECEIPT', 'ADJUSTMENT');

-- ── Account ──
ALTER TABLE "accounts"
  ADD COLUMN "subType" "AccountSubType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "postingType" "PostingType" NOT NULL DEFAULT 'POSTABLE',
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "defaultTaxCode" TEXT,
  ADD COLUMN "reconciliation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowManualPosting" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "budgetingAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fleetSegment" TEXT,
  ADD COLUMN "routeCorridor" TEXT,
  ADD COLUMN "costCenter" TEXT;

-- ── JournalEntry ──
ALTER TABLE "journal_entries"
  ADD COLUMN "docType" "JournalDocType" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "documentDate" DATE,
  ADD COLUMN "referenceNo" TEXT;

-- ── JournalLine ──
ALTER TABLE "journal_lines"
  ADD COLUMN "taxCode" TEXT,
  ADD COLUMN "openItemRef" TEXT,
  ADD COLUMN "vehicleTag" TEXT,
  ADD COLUMN "routeTag" TEXT,
  ADD COLUMN "costCenter" TEXT,
  ADD COLUMN "driverTag" TEXT,
  ADD COLUMN "partyTag" TEXT,
  ADD COLUMN "tripTag" TEXT;
