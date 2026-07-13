import { Prisma, PosSaleStatus, PosPaymentMethod } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { createJournalEntry } from "@backend/services/ledger";

/**
 * Retail / POS (M28). Over-the-counter sales of stock items. A sale is built as
 * a DRAFT, then completed — which, in one transaction, relieves each item's
 * inventory at its current average cost and posts two balanced journal entries:
 *   revenue: Dr Cash (1000)  Cr Retail Sales Revenue (4300)   [sale total]
 *   cogs:    Dr COGS (5300)  Cr Inventory (1300)              [cost of goods]
 * A completed sale can only be VOIDed (which reverses inventory & the entries).
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const CASH_ACCOUNT = "1000";
const REVENUE_ACCOUNT = "4300";
const COGS_ACCOUNT = "5300";
const INVENTORY_ACCOUNT = "1300";

async function accountId(tx: Prisma.TransactionClient, dataAreaId: string, code: string): Promise<string> {
  const a = await tx.account.findUnique({ where: { dataAreaId_code: { dataAreaId, code } }, select: { id: true } });
  if (!a) throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
  return a.id;
}

// ── Pure line/total maths (unit-tested) ──────────────────────────────────────

/** A line's sale total is quantity × unitPrice. */
export function lineTotal(quantity: Prisma.Decimal.Value, unitPrice: Prisma.Decimal.Value): Prisma.Decimal {
  return D(quantity).times(unitPrice);
}

/** Sale totals: subtotal (Σ line totals), tax, and grand total. */
export function saleTotals(
  lines: { quantity: Prisma.Decimal.Value; unitPrice: Prisma.Decimal.Value }[],
  taxAmount: Prisma.Decimal.Value = 0,
): { subtotal: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal } {
  const subtotal = lines.reduce((s, l) => s.plus(lineTotal(l.quantity, l.unitPrice)), new Prisma.Decimal(0));
  const tax = D(taxAmount);
  return { subtotal, tax, total: subtotal.plus(tax) };
}

// ── Create draft ─────────────────────────────────────────────────────────────

async function nextSaleNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.posSale.count({ where: { dataAreaId } });
  return `POS-${String(n + 1).padStart(6, "0")}`;
}

export interface PosLineInput {
  stockItemId: string;
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
}

export interface PosSaleInput {
  dataAreaId: string;
  customerName?: string | null;
  paymentMethod?: PosPaymentMethod;
  currency?: string;
  taxAmount?: Prisma.Decimal.Value;
  note?: string | null;
  lines: PosLineInput[];
  createdById?: string | null;
}

export async function createSale(input: PosSaleInput) {
  // Validate every stock item is in-company before creating the sale.
  for (const l of input.lines) {
    const item = await prisma.stockItem.findFirst({ where: { id: l.stockItemId, dataAreaId: input.dataAreaId }, select: { id: true } });
    if (!item) throw new AuthError("Stock item not found in this company", 404);
  }
  const totals = saleTotals(input.lines, input.taxAmount ?? 0);
  return prisma.posSale.create({
    data: {
      dataAreaId: input.dataAreaId,
      saleNumber: await nextSaleNumber(input.dataAreaId),
      customerName: input.customerName ?? null,
      paymentMethod: input.paymentMethod ?? "CASH",
      currency: input.currency ?? "USD",
      subtotal: totals.subtotal,
      taxAmount: totals.tax,
      total: totals.total,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
      lines: {
        create: input.lines.map((l) => ({
          dataAreaId: input.dataAreaId,
          stockItemId: l.stockItemId,
          quantity: D(l.quantity),
          unitPrice: D(l.unitPrice),
          lineTotal: lineTotal(l.quantity, l.unitPrice),
        })),
      },
    },
    include: { lines: true },
  });
}

// ── Complete ─────────────────────────────────────────────────────────────────

/**
 * Complete a DRAFT sale: relieve each item's inventory at its current average
 * cost, snapshot the cost onto the lines, and post the revenue + COGS entries.
 * Guards against overselling on-hand stock. Atomic.
 */
export async function completeSale(dataAreaId: string, id: string, userId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findFirst({ where: { id, dataAreaId }, include: { lines: true } });
    if (!sale) throw new AuthError("Sale not found", 404);
    if (sale.status !== "DRAFT") throw new AuthError("Only a DRAFT sale can be completed", 422);
    if (sale.lines.length === 0) throw new AuthError("Cannot complete a sale with no lines", 422);

    let cogs = new Prisma.Decimal(0);
    for (const line of sale.lines) {
      const item = await tx.stockItem.findUnique({ where: { id: line.stockItemId } });
      if (!item) throw new AuthError("Stock item not found", 404);
      const qty = D(line.quantity);
      if (qty.greaterThan(item.quantityOnHand)) {
        throw new AuthError(`Not enough stock for ${item.code}: ${item.quantityOnHand} on hand, ${qty.toString()} requested`, 422);
      }
      const unitCost = D(item.avgCost);
      const lineCost = qty.times(unitCost);
      cogs = cogs.plus(lineCost);

      await tx.stockItem.update({
        where: { id: item.id },
        data: { quantityOnHand: D(item.quantityOnHand).minus(qty).toFixed(3), updatedById: userId ?? null },
      });
      await tx.posSaleLine.update({
        where: { id: line.id },
        data: { unitCost: unitCost.toFixed(4), lineCost: lineCost.toFixed(2) },
      });
    }

    const [cashId, revId, cogsId, invId] = await Promise.all([
      accountId(tx, dataAreaId, CASH_ACCOUNT),
      accountId(tx, dataAreaId, REVENUE_ACCOUNT),
      accountId(tx, dataAreaId, COGS_ACCOUNT),
      accountId(tx, dataAreaId, INVENTORY_ACCOUNT),
    ]);

    const revenueEntry = await createJournalEntry(
      {
        dataAreaId, postingDate: new Date(), currency: sale.currency,
        memo: `POS sale ${sale.saleNumber}`,
        lines: [
          { accountId: cashId, debit: sale.total.toString(), memo: `Cash — ${sale.saleNumber}` },
          { accountId: revId, credit: sale.total.toString(), memo: "Retail revenue" },
        ],
        createdById: userId,
      },
      { post: true },
    );

    const cogsEntry = await createJournalEntry(
      {
        dataAreaId, postingDate: new Date(), currency: sale.currency,
        memo: `POS COGS ${sale.saleNumber}`,
        lines: [
          { accountId: cogsId, debit: cogs.toFixed(2), memo: `COGS — ${sale.saleNumber}` },
          { accountId: invId, credit: cogs.toFixed(2), memo: "Inventory relief" },
        ],
        createdById: userId,
      },
      { post: true },
    );

    return tx.posSale.update({
      where: { id: sale.id },
      data: {
        status: "COMPLETED",
        cogs: cogs.toFixed(2),
        completedAt: new Date(),
        revenueEntryId: revenueEntry.id,
        cogsEntryId: cogsEntry.id,
        updatedById: userId ?? null,
      },
      include: { lines: true },
    });
  });
}

/** Void a sale. A completed sale restores the sold stock; ledger entries stay
 * as an audit trail (reversal is a finance action, out of POS scope). */
export async function voidSale(dataAreaId: string, id: string, userId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findFirst({ where: { id, dataAreaId }, include: { lines: true } });
    if (!sale) throw new AuthError("Sale not found", 404);
    if (sale.status === "VOID") throw new AuthError("Sale is already void", 422);

    if (sale.status === "COMPLETED") {
      for (const line of sale.lines) {
        await tx.stockItem.update({
          where: { id: line.stockItemId },
          data: { quantityOnHand: { increment: line.quantity }, updatedById: userId ?? null },
        });
      }
    }
    return tx.posSale.update({ where: { id: sale.id }, data: { status: "VOID", updatedById: userId ?? null } });
  });
}
