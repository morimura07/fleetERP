-- Procurement, part D: accounts payable and governance (client requirements,
-- Sept 2026, Procurement §6; SOP steps 22 to 25). The three-way match keeps
-- its variance report on the order; a variance puts the vendor bill on
-- payment hold until it is matched or released; a supplier acknowledges an
-- order by a secure link rather than a login. Additive throughout.

ALTER TABLE "purchase_orders" ADD COLUMN "matchReport" JSONB,
ADD COLUMN "matchedAt" TIMESTAMP(3),
ADD COLUMN "matchedById" TEXT,
ADD COLUMN "supplierToken" TEXT,
ADD COLUMN "supplierTokenExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "purchase_orders_supplierToken_key" ON "purchase_orders"("supplierToken");

ALTER TABLE "vendor_invoices" ADD COLUMN "paymentHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentHoldReason" TEXT,
ADD COLUMN "paymentHoldSetAt" TIMESTAMP(3),
ADD COLUMN "paymentHoldClearedById" TEXT;
