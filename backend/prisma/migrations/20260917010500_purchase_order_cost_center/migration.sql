-- A manual purchase order names the cost centre its budget commitment is
-- recorded against; an awarded order takes its requisition's.
ALTER TABLE "purchase_orders" ADD COLUMN "costCenter" TEXT;
