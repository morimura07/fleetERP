-- Procurement, part B: sourcing (client requirements, Sept 2026,
-- Procurement §2-3). The approved vendor list and KYC on vendors; RFQs,
-- the vendors invited and the lines to price; quotations with a
-- negotiated price beside the first one; the purchase order's sourcing
-- trail, lifecycle dates and savings. Additive throughout. The new
-- PurchaseOrderStatus values are added first and used nowhere in this file.

-- AlterEnum
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'ISSUED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'ACKNOWLEDGED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'IN_PRODUCTION';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'DISPATCHED';

-- CreateEnum
CREATE TYPE "AvlStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AvlRegion" AS ENUM ('LOCAL', 'REGIONAL', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('DRAFT', 'SENT', 'CLOSED', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RfqVendorStatus" AS ENUM ('INVITED', 'QUOTED', 'DECLINED');

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "amountBase" DECIMAL(18,2),
ADD COLUMN     "baseCurrency" TEXT,
ADD COLUMN     "changeOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "committedDeliveryDate" DATE,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "inProductionAt" TIMESTAMP(3),
ADD COLUMN     "initialQuoteTotal" DECIMAL(18,2),
ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "quotationId" TEXT,
ADD COLUMN     "rfqId" TEXT,
ADD COLUMN     "supplierNote" TEXT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "avlRegion" "AvlRegion",
ADD COLUMN     "avlStatus" "AvlStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "categories" TEXT[],
ADD COLUMN     "kycNote" TEXT,
ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "kycVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "kycVerifiedById" TEXT;

-- CreateTable
CREATE TABLE "rfqs" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "rfqNumber" TEXT NOT NULL,
    "requisitionId" TEXT,
    "title" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "RfqStatus" NOT NULL DEFAULT 'DRAFT',
    "deadline" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "singleSourceJustification" TEXT,
    "singleSourceApprovedById" TEXT,
    "singleSourceApprovedAt" TIMESTAMP(3),
    "awardedQuotationId" TEXT,
    "awardedAt" TIMESTAMP(3),
    "awardedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_lines" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "requisitionLineId" TEXT,
    "stockItemId" TEXT,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PIECE',
    "quantity" DECIMAL(18,3) NOT NULL,
    "expenseCode" TEXT NOT NULL DEFAULT '5100',
    "specification" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rfq_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_vendors" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "RfqVendorStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "rfq_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "quoteRef" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATE,
    "deliveryDays" INTEGER,
    "paymentTerms" TEXT,
    "incoterm" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "negotiatedSubtotal" DECIMAL(18,2),
    "technicalScore" DECIMAL(5,2),
    "commercialScore" DECIMAL(5,2),
    "notes" TEXT,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "rfqLineId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "negotiatedUnitPrice" DECIMAL(18,4),
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "leadDays" INTEGER,
    "note" TEXT,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rfqs_dataAreaId_status_idx" ON "rfqs"("dataAreaId", "status");

-- CreateIndex
CREATE INDEX "rfqs_requisitionId_idx" ON "rfqs"("requisitionId");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_dataAreaId_rfqNumber_key" ON "rfqs"("dataAreaId", "rfqNumber");

-- CreateIndex
CREATE INDEX "rfq_lines_rfqId_idx" ON "rfq_lines"("rfqId");

-- CreateIndex
CREATE INDEX "rfq_lines_requisitionLineId_idx" ON "rfq_lines"("requisitionLineId");

-- CreateIndex
CREATE INDEX "rfq_lines_stockItemId_idx" ON "rfq_lines"("stockItemId");

-- CreateIndex
CREATE INDEX "rfq_vendors_vendorId_idx" ON "rfq_vendors"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_vendors_rfqId_vendorId_key" ON "rfq_vendors"("rfqId", "vendorId");

-- CreateIndex
CREATE INDEX "quotations_dataAreaId_idx" ON "quotations"("dataAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_rfqId_vendorId_key" ON "quotations"("rfqId", "vendorId");

-- CreateIndex
CREATE INDEX "quotation_lines_rfqLineId_idx" ON "quotation_lines"("rfqLineId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_lines_quotationId_rfqLineId_key" ON "quotation_lines"("quotationId", "rfqLineId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_quotationId_key" ON "purchase_orders"("quotationId");

-- CreateIndex
CREATE INDEX "purchase_orders_rfqId_idx" ON "purchase_orders"("rfqId");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_lines" ADD CONSTRAINT "rfq_lines_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_lines" ADD CONSTRAINT "rfq_lines_requisitionLineId_fkey" FOREIGN KEY ("requisitionLineId") REFERENCES "requisition_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_lines" ADD CONSTRAINT "rfq_lines_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_vendors" ADD CONSTRAINT "rfq_vendors_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_vendors" ADD CONSTRAINT "rfq_vendors_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "rfq_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;


