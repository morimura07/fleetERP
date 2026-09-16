import { Prisma } from "@prisma/client";
import type { GoodsReceipt, GoodsReceiptLine, QaStatus, RtvStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import type { AuthUser } from "@backend/lib/auth";
import { receiveStock } from "@backend/services/inventory";
import { policyFor } from "@backend/services/doa";
import { grnGate } from "@backend/services/logistics";
import type { GoodsReceiptInput, InspectionInput, RtvInput } from "@backend/lib/validations";

/**
 * Receiving, quality and stock integration (client requirements, Sept 2026,
 * Procurement §5; SOP steps 19 to 21).
 *
 * A goods receipt is the dock count against the order: gate entry, the
 * delivery note, quantities per line. Over-delivery is accepted up to the
 * policy's tolerance and refused beyond it. Each line then goes through
 * inspection: pass, fail or quarantine, with the parameters logged. Stock
 * is posted for the accepted quantity when a line passes (or at receipt,
 * when the policy says inspection does not gate stock). Rejected goods go
 * back on a return to vendor.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export type ReceiptDetail = GoodsReceipt & {
  lines: (GoodsReceiptLine & { purchaseOrderLine: { id: string; description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; stockItemId: string | null; expenseCode: string }; returns: { id: string; rtvNumber: string; quantity: Prisma.Decimal; status: RtvStatus }[] })[];
  purchaseOrder: { id: string; poNumber: string; vendorId: string; currency: string; vendor: { code: string; legalName: string } };
  shipment: { id: string; shipmentNumber: string } | null;
};

const include = {
  lines: {
    include: {
      purchaseOrderLine: { select: { id: true, description: true, quantity: true, unitPrice: true, stockItemId: true, expenseCode: true } },
      returns: { select: { id: true, rtvNumber: true, quantity: true, status: true } },
    },
  },
  purchaseOrder: { select: { id: true, poNumber: true, vendorId: true, currency: true, vendor: { select: { code: true, legalName: true } } } },
  shipment: { select: { id: true, shipmentNumber: true } },
};

export async function getReceipt(id: string): Promise<ReceiptDetail> {
  const r = await prisma.goodsReceipt.findUnique({ where: { id }, include });
  if (!r) throw new AuthError("Goods receipt not found", 404);
  return r;
}

async function nextReceiptNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.goodsReceipt.count({ where: { dataAreaId } });
  return `GRN-${String(n + 1).padStart(6, "0")}`;
}
async function nextRtvNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.returnToVendor.count({ where: { dataAreaId } });
  return `RTV-${String(n + 1).padStart(6, "0")}`;
}

/**
 * Post the accepted quantity to stock and remember the movement. Runs after
 * the receipt's own transaction has committed: receiveStock opens its own
 * transaction (it posts a journal entry), and nesting the two deadlocks.
 */
async function postStock(lineId: string, stockItemId: string | null, unitPrice: Prisma.Decimal, qty: Prisma.Decimal, poNumber: string, receiptNumber: string, userId: string | null) {
  if (!stockItemId || qty.lessThanOrEqualTo(0)) return null;
  const mv = await receiveStock({ stockItemId, quantity: qty, unitCost: unitPrice, reference: poNumber, memo: `GRN ${receiptNumber}`, createdById: userId });
  await prisma.goodsReceiptLine.update({ where: { id: lineId }, data: { stockMovementId: mv.id } });
  return mv.id;
}

/** Recompute the order's status from what its lines have received. */
async function refreshPoStatus(tx: Prisma.TransactionClient, purchaseOrderId: string) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId }, include: { lines: true } });
  const allReceived = po.lines.every((l) => D(l.qtyReceived).greaterThanOrEqualTo(l.quantity));
  const anyReceived = po.lines.some((l) => D(l.qtyReceived).greaterThan(0));
  const next = allReceived ? "RECEIVED" : anyReceived ? "PARTIAL" : po.status;
  if (next !== po.status && !["CLOSED", "CANCELLED"].includes(po.status)) await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: next } });
}

/**
 * The dock count (SOP step 19). Refused when the order is not far enough
 * along, when the shipment's papers are not verified, or when a line is
 * over-delivered beyond the policy's tolerance.
 */
export async function receiveGoods(poId: string, user: AuthUser, input: GoodsReceiptInput): Promise<ReceiptDetail> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true } });
  if (!po) throw new AuthError("Purchase order not found", 404);
  if (!["APPROVED", "ISSUED", "ACKNOWLEDGED", "IN_PRODUCTION", "DISPATCHED", "PARTIAL"].includes(po.status)) {
    throw new AuthError(`Goods can be received against an approved order (this one is ${po.status.toLowerCase().replace("_", " ")})`, 409);
  }
  if (input.lines.length === 0) throw new AuthError("Nothing to receive", 422);
  const gate = await grnGate(po.id, po.dataAreaId);
  if (!gate.allowed) throw new AuthError(gate.reason ?? "Shipping documents are not complete", 422);
  const policy = await policyFor(po.dataAreaId);
  const tolerance = D(policy.overDeliveryTolerancePct).dividedBy(100);
  const shipmentId = input.shipmentId ?? gate.shipmentId;
  if (input.shipmentId) {
    const s = await prisma.shipment.findFirst({ where: { id: input.shipmentId, purchaseOrderId: po.id }, select: { id: true } });
    if (!s) throw new AuthError("That shipment is not for this order", 422);
  }

  const receiptNumber = await nextReceiptNumber(po.dataAreaId);
  const toPost: { lineId: string; stockItemId: string | null; unitPrice: Prisma.Decimal; qty: Prisma.Decimal }[] = [];
  const receiptId = await prisma.$transaction(async (tx) => {
    const gr = await tx.goodsReceipt.create({
      data: {
        dataAreaId: po.dataAreaId, receiptNumber, purchaseOrderId: po.id, receivedAt: input.receivedAt ?? new Date(), note: input.note || null,
        gateEntryNo: input.gateEntryNo || null, gateEntryAt: input.gateEntryAt ?? null, deliveryNoteNo: input.deliveryNoteNo || null,
        receivedById: user.id, createdById: user.id, shipmentId,
        status: policy.qaBeforeStock ? "RECEIVED" : "COMPLETED",
      },
    });
    for (const rl of input.lines) {
      const poLine = po.lines.find((l) => l.id === rl.purchaseOrderLineId);
      if (!poLine) throw new AuthError("Receipt line does not belong to this order", 422);
      const qty = D(rl.quantity);
      if (!qty.greaterThan(0)) throw new AuthError("Receipt quantity must be positive", 422);
      const ordered = D(poLine.quantity);
      const outstanding = ordered.minus(poLine.qtyReceived);
      const ceiling = outstanding.plus(ordered.times(tolerance));
      if (qty.greaterThan(ceiling)) {
        throw new AuthError(
          `Receiving ${qty} of "${poLine.description}" exceeds the ${outstanding} outstanding${tolerance.isZero() ? "" : ` plus the ${policy.overDeliveryTolerancePct}% over-delivery tolerance (${ceiling.toDecimalPlaces(3)})`}`,
          422,
        );
      }
      const line = await tx.goodsReceiptLine.create({
        data: {
          goodsReceiptId: gr.id, purchaseOrderLineId: poLine.id, quantity: qty,
          ...(policy.qaBeforeStock ? {} : { qaStatus: "PASSED" as QaStatus, qtyAccepted: qty, inspectedAt: new Date(), inspectedById: user.id, qaNote: "Inspection not required by policy" }),
        },
      });
      await tx.purchaseOrderLine.update({
        where: { id: poLine.id },
        data: { qtyReceived: D(poLine.qtyReceived).plus(qty), ...(policy.qaBeforeStock ? {} : { qtyAccepted: D(poLine.qtyAccepted).plus(qty) }) },
      });
      if (!policy.qaBeforeStock) toPost.push({ lineId: line.id, stockItemId: poLine.stockItemId, unitPrice: poLine.unitPrice, qty });
    }
    await refreshPoStatus(tx, po.id);
    if (shipmentId) {
      const s = await tx.shipment.findUnique({ where: { id: shipmentId }, select: { status: true } });
      if (s && s.status !== "DELIVERED" && s.status !== "CANCELLED") {
        await tx.shipment.update({ where: { id: shipmentId }, data: { status: "DELIVERED", deliveredAt: new Date(), updatedById: user.id, version: { increment: 1 } } });
        await tx.shipmentEvent.create({ data: { shipmentId, kind: "STATUS", status: "DELIVERED", note: `Received on ${receiptNumber}`, userId: user.id, userName: user.name } });
      }
    }
    return gr.id;
  });
  for (const p of toPost) await postStock(p.lineId, p.stockItemId, p.unitPrice, p.qty, po.poNumber, receiptNumber, user.id);
  return getReceipt(receiptId);
}

/**
 * Inspect one receipt line (SOP step 20). Pass posts the accepted quantity
 * to stock; fail and quarantine post nothing. A quarantined line may be
 * inspected again. The receipt is complete once every line is decided.
 */
export async function inspectLine(lineId: string, user: AuthUser, input: InspectionInput): Promise<ReceiptDetail> {
  const line = await prisma.goodsReceiptLine.findUnique({ where: { id: lineId }, include: { goodsReceipt: true, purchaseOrderLine: true } });
  if (!line) throw new AuthError("Receipt line not found", 404);
  if (line.qaStatus === "PASSED" || line.qaStatus === "FAILED") throw new AuthError(`This line has already been inspected (${line.qaStatus.toLowerCase()})`, 409);
  const received = D(line.quantity);
  const accepted = input.qaStatus === "PASSED" ? D(input.qtyAccepted ?? received) : input.qaStatus === "FAILED" ? D(input.qtyAccepted ?? 0) : D(0);
  if (accepted.lessThan(0) || accepted.greaterThan(received)) throw new AuthError(`Accepted quantity must be between 0 and the ${received} received`, 422);
  const rejected = input.qaStatus === "QUARANTINE" ? D(0) : received.minus(accepted);
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: line.goodsReceipt.purchaseOrderId }, select: { poNumber: true } });

  await prisma.$transaction(async (tx) => {
    await tx.goodsReceiptLine.update({
      where: { id: lineId },
      data: { qaStatus: input.qaStatus, qtyAccepted: accepted, qtyRejected: rejected, qaNote: input.note || null, qaParams: input.params ?? undefined, inspectedById: user.id, inspectedAt: new Date() },
    });
    if (accepted.greaterThan(0)) {
      await tx.purchaseOrderLine.update({ where: { id: line.purchaseOrderLineId }, data: { qtyAccepted: D(line.purchaseOrderLine.qtyAccepted).plus(accepted) } });
    }
    const siblings = await tx.goodsReceiptLine.findMany({ where: { goodsReceiptId: line.goodsReceiptId }, select: { qaStatus: true } });
    const done = siblings.every((s) => s.qaStatus === "PASSED" || s.qaStatus === "FAILED");
    await tx.goodsReceipt.update({ where: { id: line.goodsReceiptId }, data: { status: done ? "COMPLETED" : "INSPECTING" } });
  });
  // Stock after the decision is committed; a pass with nothing to post is a non-stock line.
  if (accepted.greaterThan(0)) await postStock(lineId, line.purchaseOrderLine.stockItemId, line.purchaseOrderLine.unitPrice, accepted, po.poNumber, line.goodsReceipt.receiptNumber, user.id);
  return getReceipt(line.goodsReceiptId);
}

/** Send rejected goods back (SOP step 20). The quantity cannot exceed what was rejected less what is already on a return. */
export async function createRtv(lineId: string, user: AuthUser, input: RtvInput) {
  const line = await prisma.goodsReceiptLine.findUnique({ where: { id: lineId }, include: { goodsReceipt: { include: { purchaseOrder: { select: { id: true, vendorId: true, dataAreaId: true } } } }, returns: { select: { quantity: true, status: true } } } });
  if (!line) throw new AuthError("Receipt line not found", 404);
  if (line.qaStatus !== "FAILED") throw new AuthError("Only a failed line can be returned; inspect it first", 409);
  const already = line.returns.filter((r) => r.status !== "CLOSED").reduce((s, r) => s.plus(r.quantity), D(0));
  const returnable = D(line.qtyRejected).minus(already);
  if (D(input.quantity).greaterThan(returnable)) throw new AuthError(`Only ${returnable} rejected units are not yet on a return`, 422);
  const po = line.goodsReceipt.purchaseOrder;
  return prisma.returnToVendor.create({
    data: {
      dataAreaId: po.dataAreaId, rtvNumber: await nextRtvNumber(po.dataAreaId), goodsReceiptLineId: lineId, purchaseOrderId: po.id, vendorId: po.vendorId,
      quantity: D(input.quantity), reason: input.reason, note: input.note || null, createdById: user.id,
    },
    include: { vendor: { select: { code: true, legalName: true } }, purchaseOrder: { select: { poNumber: true } } },
  });
}

export async function updateRtv(id: string, version: number, user: AuthUser, input: { status?: RtvStatus; shippedAt?: Date | null; creditNoteRef?: string | null; creditAmount?: Prisma.Decimal.Value | null; note?: string | null }) {
  const rtv = await prisma.returnToVendor.findUnique({ where: { id } });
  if (!rtv) throw new AuthError("Return not found", 404);
  if (rtv.version !== version) throw new AuthError("This record was changed by someone else. Reload and try again.", 409);
  const data: Record<string, unknown> = {};
  if (input.status) data.status = input.status;
  if (input.shippedAt !== undefined) data.shippedAt = input.shippedAt;
  if (input.creditNoteRef !== undefined) data.creditNoteRef = input.creditNoteRef;
  if (input.creditAmount !== undefined) data.creditAmount = input.creditAmount == null ? null : D(input.creditAmount);
  if (input.note !== undefined) data.note = input.note;
  if (input.status === "SHIPPED" && !rtv.shippedAt && input.shippedAt === undefined) data.shippedAt = new Date(new Date().toISOString().slice(0, 10));
  if (input.status === "CLOSED") data.closedAt = new Date();
  return prisma.returnToVendor.update({ where: { id }, data: { ...data, updatedById: user.id, version: { increment: 1 } }, include: { vendor: { select: { code: true, legalName: true } }, purchaseOrder: { select: { poNumber: true } } } });
}
