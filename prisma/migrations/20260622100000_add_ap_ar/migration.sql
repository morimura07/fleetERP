-- CreateEnum
CREATE TYPE "PaymentTerm" AS ENUM ('NET_30', 'NET_60', 'COD');

-- CreateEnum
CREATE TYPE "VendorGroup" AS ENUM ('FUEL_SUPPLIER', 'SPARE_PARTS', 'CLEARING_AGENT', 'SUBCONTRACTED_FLEET', 'STATUTORY', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "group" "VendorGroup" NOT NULL DEFAULT 'OTHER',
    "tin" TEXT,
    "vrn" TEXT,
    "paymentTerm" "PaymentTerm" NOT NULL DEFAULT 'NET_30',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invoices" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "invoiceNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "whtAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expenseCode" TEXT NOT NULL DEFAULT '6100',
    "memo" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "postingEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidAt" DATE NOT NULL,
    "bankCode" TEXT NOT NULL DEFAULT '1010',
    "reference" TEXT,
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT,
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 30,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoices" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "invoiceNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "revenueCode" TEXT NOT NULL DEFAULT '4000',
    "tripId" TEXT,
    "memo" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "postingEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_receipts" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "receivedAt" DATE NOT NULL,
    "bankCode" TEXT NOT NULL DEFAULT '1010',
    "reference" TEXT,
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_group_idx" ON "vendors"("group");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_dataAreaId_code_key" ON "vendors"("dataAreaId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoices_postingEntryId_key" ON "vendor_invoices"("postingEntryId");

-- CreateIndex
CREATE INDEX "vendor_invoices_status_idx" ON "vendor_invoices"("status");

-- CreateIndex
CREATE INDEX "vendor_invoices_dueDate_idx" ON "vendor_invoices"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoices_vendorId_invoiceNumber_key" ON "vendor_invoices"("vendorId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payments_entryId_key" ON "vendor_payments"("entryId");

-- CreateIndex
CREATE INDEX "vendor_payments_invoiceId_idx" ON "vendor_payments"("invoiceId");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_dataAreaId_code_key" ON "customers"("dataAreaId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoices_postingEntryId_key" ON "customer_invoices"("postingEntryId");

-- CreateIndex
CREATE INDEX "customer_invoices_status_idx" ON "customer_invoices"("status");

-- CreateIndex
CREATE INDEX "customer_invoices_dueDate_idx" ON "customer_invoices"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoices_dataAreaId_invoiceNumber_key" ON "customer_invoices"("dataAreaId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "customer_receipts_entryId_key" ON "customer_receipts"("entryId");

-- CreateIndex
CREATE INDEX "customer_receipts_invoiceId_idx" ON "customer_receipts"("invoiceId");

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_postingEntryId_fkey" FOREIGN KEY ("postingEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "vendor_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_postingEntryId_fkey" FOREIGN KEY ("postingEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "customer_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
