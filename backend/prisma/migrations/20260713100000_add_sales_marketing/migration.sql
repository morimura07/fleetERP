-- Sales & Marketing (M27): CRM leads + freight quotations with priced lines,
-- convertible into freight Orders. Additive / non-destructive.

CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST');
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED');

-- ── Lead ──
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "estimatedValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "ownerId" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leads_dataAreaId_idx" ON "leads"("dataAreaId");
CREATE INDEX "leads_dataAreaId_stage_idx" ON "leads"("dataAreaId", "stage");

-- ── SalesQuote ──
CREATE TABLE "sales_quotes" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "quoteNumber" TEXT NOT NULL,
    "clientId" TEXT,
    "leadId" TEXT,
    "salesperson" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "originZone" TEXT,
    "destinationZone" TEXT,
    "cargoDescription" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "validUntil" DATE NOT NULL,
    "notes" TEXT,
    "convertedOrderId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_quotes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sales_quotes_convertedOrderId_key" ON "sales_quotes"("convertedOrderId");
CREATE UNIQUE INDEX "sales_quotes_dataAreaId_quoteNumber_key" ON "sales_quotes"("dataAreaId", "quoteNumber");
CREATE INDEX "sales_quotes_dataAreaId_idx" ON "sales_quotes"("dataAreaId");
CREATE INDEX "sales_quotes_dataAreaId_status_idx" ON "sales_quotes"("dataAreaId", "status");
CREATE INDEX "sales_quotes_clientId_idx" ON "sales_quotes"("clientId");

-- ── SalesQuoteLine ──
CREATE TABLE "sales_quote_lines" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_quote_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sales_quote_lines_quoteId_idx" ON "sales_quote_lines"("quoteId");

-- ── Foreign keys ──
ALTER TABLE "leads" ADD CONSTRAINT "leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_quote_lines" ADD CONSTRAINT "sales_quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "sales_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
