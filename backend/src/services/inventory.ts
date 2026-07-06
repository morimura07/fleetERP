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
  warehouseId?: string | null; // location for this movement (M18); null = default
  createdById?: string | null;
}

/**
 * Resolve the warehouse for a movement: the given one, else the entity's default
 * warehouse. Returns null if the entity has no warehouses configured (single-
 * location mode — balances are simply not tracked per location).
 */
async function resolveWarehouseId(
  tx: Prisma.TransactionClient,
  dataAreaId: string,
  warehouseId?: string | null,
): Promise<string | null> {
  if (warehouseId) return warehouseId;
  const def = await tx.warehouse.findFirst({
    where: { dataAreaId, isDefault: true, isActive: true },
    select: { id: true },
  });
  return def?.id ?? null;
}

/** Adjust a per-warehouse balance by delta (may be negative). Upserts the row. */
async function adjustBalance(
  tx: Prisma.TransactionClient,
  stockItemId: string,
  warehouseId: string,
  delta: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const existing = await tx.stockBalance.findUnique({
    where: { stockItemId_warehouseId: { stockItemId, warehouseId } },
  });
  const next = (existing ? D(existing.quantity) : new Prisma.Decimal(0)).plus(delta);
  if (next.isNegative()) throw new AuthError("Not enough stock at this warehouse", 422);
  await tx.stockBalance.upsert({
    where: { stockItemId_warehouseId: { stockItemId, warehouseId } },
    create: { stockItemId, warehouseId, quantity: next.toFixed(3) },
    update: { quantity: next.toFixed(3) },
  });
  return next;
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

    // Raise the per-warehouse balance (if this entity uses warehouses).
    const whId = await resolveWarehouseId(tx, item.dataAreaId, input.warehouseId);
    if (whId) await adjustBalance(tx, item.id, whId, D(input.quantity));

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
        warehouseId: whId,
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

    // Lower the per-warehouse balance (if this entity uses warehouses).
    const whId = await resolveWarehouseId(tx, item.dataAreaId, input.warehouseId);
    if (whId) await adjustBalance(tx, item.id, whId, D(input.quantity).negated());

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
        warehouseId: whId,
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

export interface TransferInput {
  stockItemId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: Prisma.Decimal.Value;
  reference?: string | null;
  memo?: string | null;
  createdById?: string | null;
}

/**
 * Move stock between two warehouses (M18). Same legal entity, same average cost —
 * no P&L and no ledger posting (the item's total on-hand and value are unchanged;
 * only the location split moves). Writes a TRANSFER_OUT + TRANSFER_IN movement
 * pair and re-balances both locations atomically.
 */
export async function transferStock(input: TransferInput) {
  const qty = D(input.quantity);
  if (!qty.greaterThan(0)) throw new AuthError("Transfer quantity must be positive", 422);
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new AuthError("Source and destination warehouses must differ", 422);
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.stockItem.findUnique({ where: { id: input.stockItemId } });
    if (!item) throw new AuthError("Stock item not found", 404);

    const [from, to] = await Promise.all([
      tx.warehouse.findUnique({ where: { id: input.fromWarehouseId } }),
      tx.warehouse.findUnique({ where: { id: input.toWarehouseId } }),
    ]);
    if (!from || !to) throw new AuthError("Warehouse not found", 404);
    if (from.dataAreaId !== item.dataAreaId || to.dataAreaId !== item.dataAreaId) {
      throw new AuthError("Warehouses must be in the item's entity", 422);
    }

    // Move the balances (adjustBalance throws 422 if the source is short).
    const outQty = await adjustBalance(tx, item.id, from.id, qty.negated());
    const inQty = await adjustBalance(tx, item.id, to.id, qty);

    const avg = item.avgCost;
    const value = qty.times(avg);
    const common = {
      dataAreaId: item.dataAreaId,
      stockItemId: item.id,
      quantity: qty.toFixed(3),
      unitCost: avg.toString(),
      totalCost: value.toFixed(2),
      avgCostAfter: avg.toString(),
      reference: input.reference ?? null,
      memo: input.memo ?? null,
      createdById: input.createdById ?? null,
    };
    const [outMv, inMv] = await Promise.all([
      tx.stockMovement.create({ data: { ...common, type: "TRANSFER_OUT", warehouseId: from.id, qtyAfter: outQty.toFixed(3) } }),
      tx.stockMovement.create({ data: { ...common, type: "TRANSFER_IN", warehouseId: to.id, qtyAfter: inQty.toFixed(3) } }),
    ]);
    return { out: outMv, in: inMv, fromBalance: outQty.toFixed(3), toBalance: inQty.toFixed(3) };
  });
}
