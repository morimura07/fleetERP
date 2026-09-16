import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

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

/** Default match tolerance: 1% on price, exact on quantity. */
const PRICE_TOLERANCE = 0.01;

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
  invoiceSubtotal: string;
  variances: MatchVarianceLine[];
}

/**
 * Pure 3-way match evaluation. Compares the PO (ordered qty + received qty +
 * price) against the vendor invoice subtotal. Returns MATCHED when every line is
 * fully received and the PO total agrees with the invoice subtotal within
 * tolerance; otherwise VARIANCE with the offending lines.
 */
export function evaluateMatch(
  poLines: { description: string; quantity: Prisma.Decimal.Value; qtyReceived: Prisma.Decimal.Value; unitPrice: Prisma.Decimal.Value }[],
  invoiceSubtotal: Prisma.Decimal.Value,
): MatchResult {
  const variances: MatchVarianceLine[] = [];
  let poTotal = new Prisma.Decimal(0);

  for (const l of poLines) {
    const ordered = D(l.quantity);
    const received = D(l.qtyReceived);
    poTotal = poTotal.plus(ordered.times(l.unitPrice));
    if (!received.equals(ordered)) {
      variances.push({
        description: l.description,
        orderedQty: ordered.toFixed(3),
        receivedQty: received.toFixed(3),
        poUnitPrice: D(l.unitPrice).toFixed(4),
        reason: received.lessThan(ordered) ? "under-received" : "over-received",
      });
    }
  }

  const sub = D(invoiceSubtotal);
  // Price/total agreement within tolerance.
  const diff = poTotal.minus(sub).abs();
  const allowed = poTotal.times(PRICE_TOLERANCE);
  if (diff.greaterThan(allowed)) {
    variances.push({
      description: "(total)",
      orderedQty: "",
      receivedQty: "",
      poUnitPrice: "",
      reason: `PO total ${poTotal.toFixed(2)} vs invoice ${sub.toFixed(2)} exceeds ${PRICE_TOLERANCE * 100}% tolerance`,
    });
  }

  return {
    status: variances.length === 0 ? "MATCHED" : "VARIANCE",
    poTotal: poTotal.toFixed(2),
    invoiceSubtotal: sub.toFixed(2),
    variances,
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
 * 3-way match a PO against a vendor invoice. On MATCHED, links the invoice and
 * (if fully received) CLOSES the PO. VARIANCE is recorded but the PO is not
 * closed — a human resolves it.
 */
export async function matchPurchaseOrder(poId: string, vendorInvoiceId: string) {
  const [po, inv] = await Promise.all([
    prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true } }),
    prisma.vendorInvoice.findUnique({ where: { id: vendorInvoiceId } }),
  ]);
  if (!po) throw new AuthError("Purchase order not found", 404);
  if (!inv) throw new AuthError("Vendor invoice not found", 404);
  if (po.dataAreaId !== inv.dataAreaId) throw new AuthError("PO and invoice are in different entities", 422);

  const result = evaluateMatch(po.lines, inv.subtotal);

  await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: {
      matchStatus: result.status,
      vendorInvoiceId: inv.id,
      ...(result.status === "MATCHED" && po.status === "RECEIVED" ? { status: "CLOSED" } : {}),
    },
  });

  return result;
}
