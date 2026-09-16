import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { policyFor } from "@backend/services/doa";

/**
 * Procurement (M15) — purchase orders, goods receipt, and 3-way match.
 *
 * Lifecycle:  DRAFT → APPROVED → PARTIAL/RECEIVED → CLOSED (or CANCELLED)
 *
 * Goods receipt feeds inventory: each received line for a stock item posts a
 * RECEIPT stock movement (raising on-hand and re-blending moving-average cost).
 *
 * The 3-way match compares, per line, the ordered vs received vs billed
 * quantities and the PO vs invoice unit price. Within tolerance ⇒ MATCHED;
 * otherwise VARIANCE (surfaced for review, never silently posted).
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** Default match tolerances when no policy is given: 1% on price, exact on quantity. */
const PRICE_TOLERANCE = 0.01;

export interface MatchTolerances {
  /** Allowed gap between the PO value of what was accepted and the invoice, as a fraction. */
  price: number;
  /** Allowed gap between ordered and accepted per line, as a fraction. */
  quantity: number;
}

export interface MatchVarianceLine {
  description: string;
  orderedQty: string;
  receivedQty: string;
  poUnitPrice: string;
  reason: string;
}

export interface MatchResult {
  status: "MATCHED" | "VARIANCE";
  poTotal: string;
  /** PO price x quantity accepted: what the invoice should be for. */
  acceptedTotal: string;
  invoiceSubtotal: string;
  variances: MatchVarianceLine[];
  tolerances: MatchTolerances;
}

/**
 * Pure three-way match (SOP step 22). Per line, ordered against received
 * (the accepted quantity when inspection ran); then the invoice against
 * the PO value of what was accepted, within the policy's tolerances.
 * Every gap is a variance line, so the report says exactly what to
 * resolve; a variance holds the payment voucher.
 */
export function evaluateMatch(
  poLines: { description: string; quantity: Prisma.Decimal.Value; qtyReceived: Prisma.Decimal.Value; qtyAccepted?: Prisma.Decimal.Value | null; unitPrice: Prisma.Decimal.Value }[],
  invoiceSubtotal: Prisma.Decimal.Value,
  tolerances: MatchTolerances = { price: PRICE_TOLERANCE, quantity: 0 },
): MatchResult {
  const variances: MatchVarianceLine[] = [];
  let poTotal = new Prisma.Decimal(0);
  let acceptedTotal = new Prisma.Decimal(0);

  for (const l of poLines) {
    const ordered = D(l.quantity);
    const received = l.qtyAccepted != null ? D(l.qtyAccepted) : D(l.qtyReceived);
    poTotal = poTotal.plus(ordered.times(l.unitPrice));
    acceptedTotal = acceptedTotal.plus(received.times(l.unitPrice));
    const gap = received.minus(ordered).abs();
    const allowed = ordered.times(tolerances.quantity);
    if (gap.greaterThan(allowed)) {
      variances.push({
        description: l.description,
        orderedQty: ordered.toFixed(3),
        receivedQty: received.toFixed(3),
        poUnitPrice: D(l.unitPrice).toFixed(4),
        reason: received.lessThan(ordered)
          ? `under-received by ${ordered.minus(received)}${allowed.isZero() ? "" : ` (tolerance ${allowed.toDecimalPlaces(3)})`}`
          : `over-received by ${received.minus(ordered)}${allowed.isZero() ? "" : ` (tolerance ${allowed.toDecimalPlaces(3)})`}`,
      });
    }
  }

  const sub = D(invoiceSubtotal);
  const diff = acceptedTotal.minus(sub).abs();
  const allowedPrice = acceptedTotal.times(tolerances.price);
  if (diff.greaterThan(allowedPrice)) {
    variances.push({
      description: "(invoice)",
      orderedQty: "",
      receivedQty: "",
      poUnitPrice: "",
      reason: `invoice ${sub.toFixed(2)} against ${acceptedTotal.toFixed(2)} accepted at PO prices; gap ${diff.toFixed(2)} exceeds the ${(tolerances.price * 100).toFixed(2)}% tolerance (${allowedPrice.toFixed(2)})`,
    });
  }

  return {
    status: variances.length === 0 ? "MATCHED" : "VARIANCE",
    poTotal: poTotal.toFixed(2),
    acceptedTotal: acceptedTotal.toFixed(2),
    invoiceSubtotal: sub.toFixed(2),
    variances,
    tolerances,
  };
}

async function nextPoNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.purchaseOrder.count({ where: { dataAreaId } });
  return `PO-${String(n + 1).padStart(6, "0")}`;
}

async function nextReceiptNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.goodsReceipt.count({ where: { dataAreaId } });
  return `GRN-${String(n + 1).padStart(6, "0")}`;
}

export interface PoLineInput {
  stockItemId?: string | null;
  description: string;
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  expenseCode?: string;
}

export interface CreatePoInput {
  dataAreaId: string;
  vendorId: string;
  currency: string;
  orderDate: Date;
  expectedAt?: Date | null;
  memo?: string | null;
  costCenter?: string | null;
  lines: PoLineInput[];
  createdById?: string | null;
}

/** Create a DRAFT purchase order with its lines; subtotal is derived. */
export async function createPurchaseOrder(input: CreatePoInput) {
  if (input.lines.length === 0) throw new AuthError("A purchase order needs at least one line", 422);

  const subtotal = input.lines.reduce((s, l) => s.plus(D(l.quantity).times(l.unitPrice)), new Prisma.Decimal(0));
  const poNumber = await nextPoNumber(input.dataAreaId);

  return prisma.purchaseOrder.create({
    data: {
      dataAreaId: input.dataAreaId,
      poNumber,
      vendorId: input.vendorId,
      currency: input.currency,
      orderDate: input.orderDate,
      expectedAt: input.expectedAt ?? null,
      subtotal: subtotal.toFixed(2),
      memo: input.memo ?? null,
      costCenter: input.costCenter ?? null,
      createdById: input.createdById ?? null,
      lines: {
        create: input.lines.map((l) => ({
          stockItemId: l.stockItemId ?? null,
          description: l.description,
          quantity: D(l.quantity).toFixed(3),
          unitPrice: D(l.unitPrice).toFixed(4),
          lineTotal: D(l.quantity).times(l.unitPrice).toFixed(2),
          expenseCode: l.expenseCode ?? "5100",
        })),
      },
    },
    include: { lines: true, vendor: { select: { legalName: true } } },
  });
}

/**
 * Three-way match a PO against a vendor invoice with the company's
 * tolerances. MATCHED links the invoice, clears any payment hold, and
 * closes a fully received order. VARIANCE keeps the report on the order
 * and puts the invoice on payment hold, which payVendorInvoice refuses to
 * pay until the hold is cleared by a later match or an authorised release.
 */
export async function matchPurchaseOrder(poId: string, vendorInvoiceId: string, userId?: string | null) {
  const [po, inv] = await Promise.all([
    prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true } }),
    prisma.vendorInvoice.findUnique({ where: { id: vendorInvoiceId } }),
  ]);
  if (!po) throw new AuthError("Purchase order not found", 404);
  if (!inv) throw new AuthError("Vendor invoice not found", 404);
  if (po.dataAreaId !== inv.dataAreaId) throw new AuthError("PO and invoice are in different entities", 422);
  if (inv.vendorId !== po.vendorId) throw new AuthError("The invoice is from a different vendor than the order", 422);
  if (inv.currency !== po.currency) throw new AuthError(`The invoice is in ${inv.currency} and the order in ${po.currency}`, 422);

  const policy = await policyFor(po.dataAreaId);
  const inspected = po.lines.some((l) => D(l.qtyAccepted).greaterThan(0)) || policy.qaBeforeStock;
  const result = evaluateMatch(
    po.lines.map((l) => ({ ...l, qtyAccepted: inspected ? l.qtyAccepted : null })),
    inv.subtotal,
    { price: D(policy.priceTolerancePct).dividedBy(100).toNumber(), quantity: D(policy.quantityTolerancePct).dividedBy(100).toNumber() },
  );

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        matchStatus: result.status,
        vendorInvoiceId: inv.id,
        matchReport: result as unknown as Prisma.InputJsonValue,
        matchedAt: new Date(),
        matchedById: userId ?? null,
        ...(result.status === "MATCHED" && po.status === "RECEIVED" ? { status: "CLOSED" } : {}),
      },
    });
    await tx.vendorInvoice.update({
      where: { id: inv.id },
      data: result.status === "VARIANCE"
        ? { paymentHold: true, paymentHoldReason: `Three-way match variance on ${po.poNumber}: ${result.variances.map((v) => `${v.description} ${v.reason}`).join("; ")}`, paymentHoldSetAt: new Date(), paymentHoldClearedById: null }
        : { paymentHold: false, paymentHoldReason: null, paymentHoldClearedById: userId ?? null },
    });
  });

  return result;
}

/** An authorised person lifts the payment hold without a clean match, with a reason on record. */
export async function releasePaymentHold(invoiceId: string, userId: string, reason: string) {
  const inv = await prisma.vendorInvoice.findUnique({ where: { id: invoiceId }, select: { id: true, paymentHold: true, paymentHoldReason: true } });
  if (!inv) throw new AuthError("Vendor invoice not found", 404);
  if (!inv.paymentHold) throw new AuthError("This bill is not on hold", 409);
  return prisma.vendorInvoice.update({
    where: { id: invoiceId },
    data: { paymentHold: false, paymentHoldReason: `Released: ${reason} (was: ${inv.paymentHoldReason ?? "hold"})`, paymentHoldClearedById: userId },
  });
}
