-- A goods receipt line now relates to its purchase order line, so inspection
-- can read the item and price. No orphan rows existed when this was written.
CREATE INDEX "goods_receipt_lines_purchaseOrderLineId_idx" ON "goods_receipt_lines"("purchaseOrderLineId");
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
