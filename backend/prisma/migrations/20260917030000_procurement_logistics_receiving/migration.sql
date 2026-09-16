-- Procurement, part C: logistics, customs and receiving (client requirements,
-- Sept 2026, Procurement §4-5; SOP steps 16 to 21). Shipments with their
-- plan, papers, log and clearance; goods receipts with gate entry and
-- quality inspection per line, stock posted for the accepted quantity;
-- returns to vendor. Additive throughout.

-- CreateEnum
CREATE TYPE "ShipmentMode" AS ENUM ('SEA', 'AIR', 'ROAD', 'RAIL', 'COURIER');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'ARRIVED', 'CLEARING', 'CLEARED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClearanceStatus" AS ENUM ('NOT_STARTED', 'DOCS_LODGED', 'ASSESSED', 'DUTY_PAID', 'RELEASED', 'HELD');

-- CreateEnum
CREATE TYPE "ShipmentDocType" AS ENUM ('TRANSPORT_DOCUMENT', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'CERTIFICATE_OF_ORIGIN', 'INSURANCE_CERTIFICATE', 'IMPORT_PERMIT', 'CUSTOMS_DECLARATION', 'RELEASE_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "ShipmentEventKind" AS ENUM ('STATUS', 'LOCATION', 'CLEARANCE', 'NOTE');

-- CreateEnum
CREATE TYPE "GrnStatus" AS ENUM ('RECEIVED', 'INSPECTING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QaStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'QUARANTINE');

-- CreateEnum
CREATE TYPE "RtvStatus" AS ENUM ('OPEN', 'SHIPPED', 'CREDITED', 'CLOSED');

-- AlterTable
ALTER TABLE "goods_receipt_lines" ADD COLUMN     "inspectedAt" TIMESTAMP(3),
ADD COLUMN     "inspectedById" TEXT,
ADD COLUMN     "qaNote" TEXT,
ADD COLUMN     "qaParams" JSONB,
ADD COLUMN     "qaStatus" "QaStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "qtyAccepted" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "qtyRejected" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN     "deliveryNoteNo" TEXT,
ADD COLUMN     "gateEntryAt" TIMESTAMP(3),
ADD COLUMN     "gateEntryNo" TEXT,
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "shipmentId" TEXT,
ADD COLUMN     "status" "GrnStatus" NOT NULL DEFAULT 'RECEIVED';

-- AlterTable
ALTER TABLE "procurement_policies" ADD COLUMN     "grnRequiredDocs" TEXT[] DEFAULT ARRAY['TRANSPORT_DOCUMENT', 'COMMERCIAL_INVOICE', 'PACKING_LIST']::TEXT[],
ADD COLUMN     "qaBeforeStock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "purchase_order_lines" ADD COLUMN     "qtyAccepted" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "shipmentNumber" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PLANNED',
    "incoterm" TEXT,
    "mode" "ShipmentMode" NOT NULL DEFAULT 'SEA',
    "carrier" TEXT,
    "vesselOrFlight" TEXT,
    "containerNo" TEXT,
    "transportDocNo" TEXT,
    "portOfLoading" TEXT,
    "portOfDischarge" TEXT,
    "etd" DATE,
    "eta" DATE,
    "atd" DATE,
    "ata" DATE,
    "deliveredAt" TIMESTAMP(3),
    "clearingAgentId" TEXT,
    "clearanceStatus" "ClearanceStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "clearanceRef" TEXT,
    "dutyCurrency" TEXT NOT NULL DEFAULT 'USD',
    "dutyEstimate" DECIMAL(18,2),
    "dutyPaid" DECIMAL(18,2),
    "dutyPaidAt" DATE,
    "customsValue" DECIMAL(18,2),
    "dutyRatePct" DECIMAL(5,2),
    "vatRatePct" DECIMAL(5,2),
    "otherChargesEst" DECIMAL(18,2),
    "clearanceNote" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_documents" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "docType" "ShipmentDocType" NOT NULL,
    "reference" TEXT,
    "attachmentId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "kind" "ShipmentEventKind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT,
    "location" TEXT,
    "note" TEXT,
    "userId" TEXT,
    "userName" TEXT,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns_to_vendor" (
    "id" TEXT NOT NULL,
    "dataAreaId" TEXT NOT NULL DEFAULT 'HQ01',
    "rtvNumber" TEXT NOT NULL,
    "goodsReceiptLineId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RtvStatus" NOT NULL DEFAULT 'OPEN',
    "shippedAt" DATE,
    "creditNoteRef" TEXT,
    "creditAmount" DECIMAL(18,2),
    "closedAt" TIMESTAMP(3),
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "returns_to_vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipments_purchaseOrderId_idx" ON "shipments"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "shipments_dataAreaId_status_idx" ON "shipments"("dataAreaId", "status");

-- CreateIndex
CREATE INDEX "shipments_clearingAgentId_idx" ON "shipments"("clearingAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_dataAreaId_shipmentNumber_key" ON "shipments"("dataAreaId", "shipmentNumber");

-- CreateIndex
CREATE INDEX "shipment_documents_shipmentId_idx" ON "shipment_documents"("shipmentId");

-- CreateIndex
CREATE INDEX "shipment_events_shipmentId_at_idx" ON "shipment_events"("shipmentId", "at");

-- CreateIndex
CREATE INDEX "returns_to_vendor_purchaseOrderId_idx" ON "returns_to_vendor"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "returns_to_vendor_vendorId_idx" ON "returns_to_vendor"("vendorId");

-- CreateIndex
CREATE INDEX "returns_to_vendor_dataAreaId_status_idx" ON "returns_to_vendor"("dataAreaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "returns_to_vendor_dataAreaId_rtvNumber_key" ON "returns_to_vendor"("dataAreaId", "rtvNumber");

-- CreateIndex
CREATE INDEX "goods_receipts_shipmentId_idx" ON "goods_receipts"("shipmentId");

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_clearingAgentId_fkey" FOREIGN KEY ("clearingAgentId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_documents" ADD CONSTRAINT "shipment_documents_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns_to_vendor" ADD CONSTRAINT "returns_to_vendor_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "goods_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns_to_vendor" ADD CONSTRAINT "returns_to_vendor_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns_to_vendor" ADD CONSTRAINT "returns_to_vendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


