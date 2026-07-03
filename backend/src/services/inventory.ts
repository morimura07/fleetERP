import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { createJournalEntry } from "@backend/services/ledger";

/**
 * Inventory valuation (M14) — moving-average cost.
 *
 * Each item tracks quantityOnHand + avgCost. Movements adjust both and post to
 * the ledger:
 *   RECEIPT:    Dr Inventory (1300)      Cr Accrued/AP (2300)
 *   ISSUE:      Dr Expense (item code)   Cr Inventory (1300)
 *   ADJUSTMENT: revalues on-hand to a counted quantity; the variance hits the
 *               inventory account against a variance expense (2300/6xxx).
 *
 * The pure cost math lives in `applyReceipt` / `issueValue` so it is unit-tested
 * independently of Prisma and the ledger.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ACCRUED = "2300"; // Accrued Expenses (offset for receipts without a bill)

export interface AvgState {
  qty: Prisma.Decimal;
  avgCost: Prisma.Decimal;
}

/**
 * Moving-average after a receipt:
 *   newAvg = (qty·avg + inQty·inCost) / (qty + inQty)
 * Returns the new {qty, avgCost}. Pure.
 */
export function applyReceipt(state: AvgState, inQty: Prisma.Decimal.Value, inCost: Prisma.Decimal.Value): AvgState {
  const q = D(inQty);
  if (!q.greaterThan(0)) throw new AuthError("Receipt quantity must be positive", 422);
  const newQty = state.qty.plus(q);
  const totalValue = state.qty.times(state.avgCost).plus(q.times(inCost));
  const newAvg = newQty.isZero() ? new Prisma.Decimal(0) : totalValue.dividedBy(newQty);
  return { qty: newQty, avgCost: newAvg };
}

/**
 * Value + new state after an issue. Issues out at the current average; the
 * average is unchanged, quantity decreases. Pure.
 */
export function issueValue(state: AvgState, outQty: Prisma.Decimal.Value): { state: AvgState; value: Prisma.Decimal } {
  const q = D(outQty);
  if (!q.greaterThan(0)) throw new AuthError("Issue quantity must be positive", 422);
  if (q.greaterThan(state.qty)) throw new AuthError("Not enough stock on hand", 422);
  const value = q.times(state.avgCost);
  return { state: { qty: state.qty.minus(q), avgCost: state.avgCost }, value };
}

async function accountId(dataAreaId: string, code: string): Promise<string> {
  const a = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  if (!a) throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
  return a.id;
}

interface MovementInput {
  stockItemId: string;
  quantity: Prisma.Decimal.Value;
  unitCost?: Prisma.Decimal.Value; // required for RECEIPT / ADJUSTMENT; ignored for ISSUE
  reference?: string | null;
  memo?: string | null;
  createdById?: string | null;
}

/** Receive stock: raise on-hand, recompute average, post Dr Inventory / Cr Accrued. */
export async function receiveStock(input: MovementInput) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.stockItem.findUnique({ where: { id: input.stockItemId } });
    if (!item) throw new AuthError("Stock item not found", 404);
    const inCost = D(input.unitCost ?? 0);

    const next = applyReceipt({ qty: D(item.quantityOnHand), avgCost: D(item.avgCost) }, input.quantity, inCost);
    const totalCost = D(input.quantity).times(inCost);

    const [invId, accruedId] = await Promise.all([
      accountId(item.dataAreaId, item.glCode),
      accountId(item.dataAreaId, ACCRUED),
    ]);
    const entry = await createJournalEntry(
      {
        dataAreaId: item.dataAreaId,
        postingDate: new Date(),
        currency: item.currency,
        memo: `Stock receipt ${item.code}`,
        lines: [
          { accountId: invId, debit: totalCost.toString(), memo: `Receive ${item.code}` },
          { accountId: accruedId, credit: totalCost.toString(), memo: "Accrued stock purchase" },
        ],
        createdById: input.createdById,
      },
      { post: true },
    );

    await tx.stockItem.update({
      where: { id: item.id },
      data: { quantityOnHand: next.qty.toFixed(3), avgCost: next.avgCost.toFixed(4), updatedById: input.createdById ?? null },
    });
    return tx.stockMovement.create({
      data: {
        dataAreaId: item.dataAreaId,
        stockItemId: item.id,
        type: "RECEIPT",
        quantity: D(input.quantity).toFixed(3),
        unitCost: inCost.toFixed(4),
        totalCost: totalCost.toFixed(2),
        qtyAfter: next.qty.toFixed(3),
        avgCostAfter: next.avgCost.toFixed(4),
        reference: input.reference ?? null,
        memo: input.memo ?? null,
        postingEntryId: entry.id,
        createdById: input.createdById ?? null,
      },
    });
  });
}

/** Issue stock: lower on-hand at current average, post Dr Expense / Cr Inventory. */
export async function issueStock(input: MovementInput) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.stockItem.findUnique({ where: { id: input.stockItemId } });
    if (!item) throw new AuthError("Stock item not found", 404);

    const { state: next, value } = issueValue(
      { qty: D(item.quantityOnHand), avgCost: D(item.avgCost) },
      input.quantity,
    );

    const [invId, expenseId] = await Promise.all([
      accountId(item.dataAreaId, item.glCode),
      accountId(item.dataAreaId, item.expenseCode),
    ]);
    const entry = await createJournalEntry(
      {
        dataAreaId: item.dataAreaId,
        postingDate: new Date(),
        currency: item.currency,
        memo: `Stock issue ${item.code}`,
        lines: [
          { accountId: expenseId, debit: value.toString(), memo: `Issue ${item.code}` },
          { accountId: invId, credit: value.toString(), memo: "Inventory relief" },
        ],
        createdById: input.createdById,
      },
      { post: true },
    );

    await tx.stockItem.update({
      where: { id: item.id },
      data: { quantityOnHand: next.qty.toFixed(3), updatedById: input.createdById ?? null },
    });
    return tx.stockMovement.create({
      data: {
        dataAreaId: item.dataAreaId,
        stockItemId: item.id,
        type: "ISSUE",
        quantity: D(input.quantity).toFixed(3),
        unitCost: item.avgCost.toString(),
        totalCost: value.toFixed(2),
        qtyAfter: next.qty.toFixed(3),
        avgCostAfter: item.avgCost.toString(),
        reference: input.reference ?? null,
        memo: input.memo ?? null,
        postingEntryId: entry.id,
        createdById: input.createdById ?? null,
      },
    });
  });
}

/** Total inventory value of an item (qty × avgCost). */
export function itemValue(item: { quantityOnHand: Prisma.Decimal.Value; avgCost: Prisma.Decimal.Value }): Prisma.Decimal {
  return D(item.quantityOnHand).times(item.avgCost);
}
