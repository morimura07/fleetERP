import { Prisma } from "@prisma/client";
import type { PurchaseOrder, PurchaseOrderLine } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import type { AuthUser } from "@backend/lib/auth";
import { consume } from "@backend/services/budget";
import { openRequest, pendingRequestFor, requestsFor, decide, policyFor, toTierCurrency, changeNeedsRetrigger, type RequestWithDecisions } from "@backend/services/doa";
import { getRfq, comparison } from "@backend/services/sourcing";
import type { ChangeOrderInput, AcknowledgeInput } from "@backend/lib/validations";

/**
 * The purchase order's life after sourcing (client requirements, Sept 2026,
 * Procurement §3; SOP steps 12 to 15):
 *
 *   award -> DRAFT? no: PENDING_APPROVAL (the DOA matrix on the negotiated value)
 *   APPROVED -> ISSUED (transmitted) -> ACKNOWLEDGED (supplier committed a date)
 *   -> IN_PRODUCTION -> DISPATCHED -> PARTIAL / RECEIVED (goods receipt) -> CLOSED (matched)
 *
 * A manual PO (no RFQ) goes through the same matrix when submitted. A change
 * order beyond the policy's variance, or into another tier, re-opens the
 * matrix and puts the order back to pending approval.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export type PoDetail = PurchaseOrder & {
  lines: PurchaseOrderLine[];
  vendor: { id: string; code: string; legalName: string; email: string | null; currency: string; paymentTerm: string };
  approvals: RequestWithDecisions[];
  savings: { initial: string | null; final: string; saved: string | null; savedPct: string | null };
};

export async function getPo(id: string): Promise<PoDetail> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true, vendor: { select: { id: true, code: true, legalName: true, email: true, currency: true, paymentTerm: true } }, receipts: { select: { id: true } } },
  });
  if (!po) throw new AuthError("Purchase order not found", 404);
  const saved = po.initialQuoteTotal == null ? null : D(po.initialQuoteTotal).minus(po.subtotal);
  return {
    ...po,
    approvals: await requestsFor("PURCHASE_ORDER", id),
    savings: {
      initial: po.initialQuoteTotal == null ? null : D(po.initialQuoteTotal).toFixed(2),
      final: D(po.subtotal).toFixed(2),
      saved: saved == null ? null : saved.toFixed(2),
      savedPct: saved == null || D(po.initialQuoteTotal!).isZero() ? null : saved.dividedBy(po.initialQuoteTotal!).times(100).toFixed(1),
    },
  };
}

async function nextPoNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.purchaseOrder.count({ where: { dataAreaId } });
  return `PO-${String(n + 1).padStart(6, "0")}`;
}

/** Record the commitment against the budget for each expense code on the order. */
async function commitBudget(po: PurchaseOrder & { lines: PurchaseOrderLine[] }, override: boolean, tx: Prisma.TransactionClient) {
  const byAccount = new Map<string, Prisma.Decimal>();
  for (const l of po.lines) byAccount.set(l.expenseCode, (byAccount.get(l.expenseCode) ?? D(0)).plus(l.lineTotal));
  const fiscalYear = po.orderDate.getUTCFullYear();
  const req = po.requisitionId ? await tx.requisition.findUnique({ where: { id: po.requisitionId }, select: { costCenter: true } }) : null;
  const costCenter = po.costCenter ?? req?.costCenter ?? undefined;
  for (const [accountCode, amount] of byAccount) {
    await consume({ dataAreaId: po.dataAreaId, fiscalYear, accountCode, costCenter, amount, override, tx });
  }
}

/** Open the matrix on the order's value and park it as pending approval. */
async function toApproval(po: PoDetail, user: AuthUser, reason: string): Promise<PoDetail> {
  const policy = await policyFor(po.dataAreaId);
  const { amountBase, baseCurrency } = await toTierCurrency(po.subtotal, po.currency, po.dataAreaId, policy);
  await openRequest({
    dataAreaId: po.dataAreaId, subjectType: "PURCHASE_ORDER", subjectId: po.id, subjectRef: po.poNumber,
    amount: po.subtotal, currency: po.currency, reason, requestedById: user.id,
  });
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "PENDING_APPROVAL", amountBase, baseCurrency, updatedById: user.id, version: { increment: 1 } } });
  return getPo(po.id);
}

/**
 * Award an RFQ to one quotation (SOP step 12): the three-quote gate, the
 * purchase order from the negotiated prices, the budget commitment, and
 * the matrix on the order's value. The requisition becomes ORDERED.
 */
export async function awardRfq(rfqId: string, quotationId: string, user: AuthUser, note?: string | null): Promise<PoDetail> {
  const rfq = await getRfq(rfqId);
  const cmp = await comparison(rfqId);
  if (!cmp.canAward) throw new AuthError(cmp.awardBlockedBy ?? "The RFQ cannot be awarded", 422);
  const q = rfq.quotations.find((x) => x.id === quotationId);
  if (!q) throw new AuthError("That quotation is not on this RFQ", 404);
  if (q.validUntil && q.validUntil < new Date(new Date().toISOString().slice(0, 10))) throw new AuthError("That quotation has expired; ask the vendor to extend it", 422);
  const requisition = rfq.requisitionId ? await prisma.requisition.findUnique({ where: { id: rfq.requisitionId }, select: { budgetStatus: true } }) : null;

  const lines = rfq.lines.map((l) => {
    const ql = q.lines.find((x) => x.rfqLineId === l.id)!;
    const unitPrice = D(ql.negotiatedUnitPrice ?? ql.unitPrice);
    return {
      stockItemId: l.stockItemId, description: l.description, quantity: D(l.quantity), unitPrice,
      lineTotal: unitPrice.times(l.quantity).toDecimalPlaces(2), expenseCode: l.expenseCode,
    };
  });
  const subtotal = lines.reduce((s, l) => s.plus(l.lineTotal), D(0));
  const expectedAt = q.deliveryDays != null ? new Date(Date.now() + q.deliveryDays * 86_400_000) : null;

  const poId = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        dataAreaId: rfq.dataAreaId, poNumber: await nextPoNumber(rfq.dataAreaId), vendorId: q.vendorId, currency: q.currency,
        orderDate: new Date(), expectedAt, subtotal, memo: note || `Awarded from ${rfq.rfqNumber}${q.quoteRef ? ` (quote ${q.quoteRef})` : ""}`,
        requisitionId: rfq.requisitionId, rfqId: rfq.id, quotationId: q.id,
        initialQuoteTotal: D(q.subtotal), createdById: user.id,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await commitBudget(po, requisition?.budgetStatus === "OVERRIDDEN", tx);
    await tx.rfq.update({ where: { id: rfqId }, data: { status: "AWARDED", awardedQuotationId: q.id, awardedAt: new Date(), awardedById: user.id, updatedById: user.id, version: { increment: 1 } } });
    if (rfq.requisitionId) await tx.requisition.update({ where: { id: rfq.requisitionId }, data: { status: "ORDERED", updatedById: user.id, version: { increment: 1 } } });
    return po.id;
  });
  return toApproval(await getPo(poId), user, "award");
}

/** A manual draft order goes through the matrix the same way. */
export async function submitPo(id: string, user: AuthUser): Promise<PoDetail> {
  const po = await getPo(id);
  if (po.status !== "DRAFT") throw new AuthError(`Only a draft order can be submitted (this one is ${po.status.toLowerCase().replace("_", " ")})`, 409);
  if (po.lines.length === 0) throw new AuthError("Add at least one line", 422);
  await prisma.$transaction(async (tx) => commitBudget(po, false, tx));
  return toApproval(po, user, "initial");
}

/** One signature. Approval releases the order, and issues it at once when the tier says so. */
export async function decidePo(id: string, user: AuthUser, approve: boolean, note?: string | null): Promise<PoDetail> {
  const po = await getPo(id);
  if (po.status !== "PENDING_APPROVAL") throw new AuthError(`Not awaiting approval (status ${po.status.toLowerCase().replace("_", " ")})`, 409);
  const pending = await pendingRequestFor("PURCHASE_ORDER", id);
  if (!pending) throw new AuthError("No open approval request", 409);
  const { request, outcome } = await decide(pending.id, user, approve, note);
  if (outcome === "APPROVED") {
    const release = request.tier?.autoRelease ?? false;
    await prisma.purchaseOrder.update({
      where: { id },
      data: { status: release ? "ISSUED" : "APPROVED", approvedById: user.id, approvedAt: new Date(), ...(release ? { issuedAt: new Date() } : {}), updatedById: user.id, version: { increment: 1 } },
    });
  } else if (outcome === "REJECTED") {
    await prisma.purchaseOrder.update({ where: { id }, data: { status: "DRAFT", memo: `${po.memo ?? ""}\nRejected in approval: ${note ?? "no reason given"}`.trim(), updatedById: user.id, version: { increment: 1 } } });
  }
  return getPo(id);
}

const step = async (id: string, user: AuthUser, from: PurchaseOrder["status"][], to: PurchaseOrder["status"], data: Record<string, unknown> = {}) => {
  const po = await getPo(id);
  if (!from.includes(po.status)) throw new AuthError(`Cannot move a ${po.status.toLowerCase().replace("_", " ")} order to ${to.toLowerCase().replace("_", " ")}`, 409);
  await prisma.purchaseOrder.update({ where: { id }, data: { status: to, ...data, updatedById: user.id, version: { increment: 1 } } });
  return getPo(id);
};

/** APPROVED -> ISSUED: the order is transmitted (PDF; email once SMTP is configured). */
export const issuePo = (id: string, user: AuthUser) => step(id, user, ["APPROVED"], "ISSUED", { issuedAt: new Date() });

/** The supplier accepts (with a delivery date) or rejects. */
export async function acknowledgePo(id: string, user: AuthUser, input: AcknowledgeInput): Promise<PoDetail> {
  if (!input.accept) return step(id, user, ["ISSUED"], "CANCELLED", { supplierNote: `Rejected by supplier: ${input.note || "no reason given"}` });
  if (!input.committedDeliveryDate) throw new AuthError("A committed delivery date is required to accept", 422);
  return step(id, user, ["ISSUED"], "ACKNOWLEDGED", { acknowledgedAt: new Date(), committedDeliveryDate: input.committedDeliveryDate, expectedAt: input.committedDeliveryDate, supplierNote: input.note || null });
}
export const markInProduction = (id: string, user: AuthUser, note?: string | null) => step(id, user, ["ACKNOWLEDGED"], "IN_PRODUCTION", { inProductionAt: new Date(), ...(note ? { supplierNote: note } : {}) });
export const markDispatched = (id: string, user: AuthUser, note?: string | null) => step(id, user, ["ACKNOWLEDGED", "IN_PRODUCTION"], "DISPATCHED", { dispatchedAt: new Date(), ...(note ? { supplierNote: note } : {}) });

export async function cancelPo(id: string, user: AuthUser, reason?: string | null): Promise<PoDetail> {
  const po = await getPo(id);
  if (["PARTIAL", "RECEIVED", "CLOSED"].includes(po.status)) throw new AuthError("Goods have been received against this order; it cannot be cancelled", 409);
  await prisma.$transaction(async (tx) => {
    await tx.approvalRequest.updateMany({ where: { subjectType: "PURCHASE_ORDER", subjectId: id, status: "PENDING" }, data: { status: "SUPERSEDED", resolvedAt: new Date() } });
    await tx.approvalDecision.updateMany({ where: { request: { subjectType: "PURCHASE_ORDER", subjectId: id }, status: "PENDING" }, data: { status: "SKIPPED" } });
    await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED", memo: reason ? `${po.memo ?? ""}\nCancelled: ${reason}`.trim() : po.memo, updatedById: user.id, version: { increment: 1 } } });
  });
  return getPo(id);
}

/**
 * A change order: lines replaced before anything is received. The matrix
 * re-opens when the policy says the change is big enough; otherwise the
 * order keeps its status and the change is only recorded.
 */
export async function changeOrder(id: string, version: number, user: AuthUser, input: ChangeOrderInput): Promise<PoDetail & { retriggered: string | null }> {
  const po = await getPo(id);
  if (!["DRAFT", "APPROVED", "ISSUED", "ACKNOWLEDGED", "IN_PRODUCTION"].includes(po.status)) throw new AuthError(`A ${po.status.toLowerCase().replace("_", " ")} order cannot be changed`, 409);
  if (po.version !== version) throw new AuthError("This record was changed by someone else. Reload and try again.", 409);
  const received = await prisma.goodsReceipt.count({ where: { purchaseOrderId: id } });
  if (received > 0) throw new AuthError("Goods have been received against this order; raise a new order for the difference", 409);
  const lines = input.lines.map((l) => ({
    stockItemId: l.stockItemId || null, description: l.description, quantity: D(l.quantity), unitPrice: D(l.unitPrice),
    lineTotal: D(l.quantity).times(l.unitPrice).toDecimalPlaces(2), expenseCode: l.expenseCode || "5100",
  }));
  const subtotal = lines.reduce((s, l) => s.plus(l.lineTotal), D(0));
  const policy = await policyFor(po.dataAreaId);
  const { amountBase } = await toTierCurrency(subtotal, po.currency, po.dataAreaId, policy);
  const check = po.status === "DRAFT" ? { retrigger: false, reason: null } : await changeNeedsRetrigger(po.dataAreaId, po.amountBase ?? 0, amountBase);
  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    await tx.purchaseOrderLine.createMany({ data: lines.map((l) => ({ ...l, purchaseOrderId: id })) });
    await tx.purchaseOrder.update({
      where: { id },
      data: { subtotal, changeOrders: { increment: 1 }, memo: `${po.memo ?? ""}\nChange order ${po.changeOrders + 1}: ${input.reason}`.trim(), updatedById: user.id, version: { increment: 1 } },
    });
  });
  if (check.retrigger) {
    const fresh = await getPo(id);
    const back = await toApproval(fresh, user, `change order ${po.changeOrders + 1}: ${check.reason}`);
    return { ...back, retriggered: check.reason };
  }
  return { ...(await getPo(id)), retriggered: null };
}
