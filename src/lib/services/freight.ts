import { Prisma, TripExpenseType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/errors";
import { createJournalEntry } from "@/lib/services/ledger";

/**
 * Freight domain — orders & trips, and their settlement into the ledger.
 *
 * Two postings tie operations to accounting:
 *   - Order invoice:   Dr Accounts Receivable (1100) / Cr Freight Revenue (4000)
 *                      (+ Cr Demurrage Income (4100) when demurrage applies)
 *   - Trip expense:    Dr <expense account> / Cr Accounts Payable (2000)
 *
 * Trip P&L = order revenue − Σ(posted trip expenses).
 */

// Account codes the postings target. Must exist in the seeded chart of accounts.
const AR_ACCOUNT = "1100";
const FREIGHT_REVENUE = "4000";
const DEMURRAGE_INCOME = "4100";
const ACCOUNTS_PAYABLE = "2000";

/** Expense type → chart-of-accounts code. */
const EXPENSE_ACCOUNT: Record<TripExpenseType, string> = {
  FUEL: "5000",
  TOLLS: "5010",
  BORDER_FEES: "5020",
  DRIVER_ALLOWANCE: "5030",
  DEMURRAGE: "5040",
  MAINTENANCE: "5100",
  OTHER: "6100", // Office & Administrative (fallback)
};

/** Resolve an account id by code within a legal entity, or throw 404. */
async function accountIdByCode(dataAreaId: string, code: string): Promise<string> {
  const account = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  if (!account) {
    throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
  }
  return account.id;
}

/**
 * Post an order's AR invoice to the ledger and mark it INVOICED.
 * Idempotent guard: an already-invoiced order is rejected.
 */
export async function invoiceOrder(orderId: string, createdById?: string | null) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AuthError("Order not found", 404);
  if (order.invoiceEntryId || order.status === "INVOICED") {
    throw new AuthError("This order has already been invoiced", 409);
  }
  if (order.status === "CANCELLED") {
    throw new AuthError("Cancelled orders cannot be invoiced", 409);
  }

  const freight = new Prisma.Decimal(order.freightAmount);
  const demurrage = new Prisma.Decimal(order.demurrageAmount);
  const total = freight.plus(demurrage);
  if (!total.greaterThan(0)) {
    throw new AuthError("Invoice amount is zero", 422);
  }

  const [arId, revenueId, demurrageId] = await Promise.all([
    accountIdByCode(order.dataAreaId, AR_ACCOUNT),
    accountIdByCode(order.dataAreaId, FREIGHT_REVENUE),
    demurrage.greaterThan(0)
      ? accountIdByCode(order.dataAreaId, DEMURRAGE_INCOME)
      : Promise.resolve(""),
  ]);

  const lines = [
    { accountId: arId, debit: total.toString(), memo: `Invoice ${order.orderCode}` },
    { accountId: revenueId, credit: freight.toString(), memo: "Freight revenue" },
    ...(demurrage.greaterThan(0)
      ? [{ accountId: demurrageId, credit: demurrage.toString(), memo: "Demurrage" }]
      : []),
  ];

  const entry = await createJournalEntry(
    {
      dataAreaId: order.dataAreaId,
      postingDate: new Date(),
      currency: order.currency,
      memo: `AR invoice for order ${order.orderCode}`,
      lines,
      createdById,
    },
    { post: true },
  );

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "INVOICED", invoiceEntryId: entry.id },
  });

  return entry;
}

/**
 * Post a trip expense to the ledger (Dr expense / Cr A/P) and link it.
 * Idempotent guard: an already-posted expense is rejected.
 */
export async function postTripExpense(expenseId: string, createdById?: string | null) {
  const expense = await prisma.tripExpense.findUnique({
    where: { id: expenseId },
    include: { trip: { select: { dataAreaId: true, tripCode: true } } },
  });
  if (!expense) throw new AuthError("Expense not found", 404);
  if (expense.entryId) throw new AuthError("This expense has already been posted", 409);

  const dataAreaId = expense.trip.dataAreaId;
  const amount = new Prisma.Decimal(expense.amount);
  if (!amount.greaterThan(0)) throw new AuthError("Expense amount is zero", 422);

  const [expenseAcctId, apId] = await Promise.all([
    accountIdByCode(dataAreaId, EXPENSE_ACCOUNT[expense.type]),
    accountIdByCode(dataAreaId, ACCOUNTS_PAYABLE),
  ]);

  const entry = await createJournalEntry(
    {
      dataAreaId,
      postingDate: new Date(),
      currency: expense.currency,
      memo: `${expense.type} on trip ${expense.trip.tripCode}`,
      lines: [
        { accountId: expenseAcctId, debit: amount.toString(), memo: expense.note ?? expense.type },
        { accountId: apId, credit: amount.toString(), memo: "Trip expense payable" },
      ],
      createdById,
    },
    { post: true },
  );

  await prisma.tripExpense.update({
    where: { id: expense.id },
    data: { entryId: entry.id },
  });

  return entry;
}

export interface PnLFigures {
  revenue: Prisma.Decimal;
  expenses: Prisma.Decimal;
  profit: Prisma.Decimal;
  marginPct: Prisma.Decimal; // profit / revenue * 100, 0 when no revenue
  expenseByType: Record<string, string>;
}

export interface TripPnL extends PnLFigures {
  tripId: string;
  tripCode: string;
  currency: string;
}

/**
 * Pure P&L arithmetic: profit = (freight + demurrage) − Σ expenses, and
 * margin% = profit/revenue*100 (0 when revenue is 0). Kept side-effect free so
 * it is unit-testable independently of Prisma.
 */
export function tripPnL(
  freightAmount: Prisma.Decimal.Value,
  demurrageAmount: Prisma.Decimal.Value,
  expenses: { type: string; amount: Prisma.Decimal.Value }[],
): PnLFigures {
  const revenue = new Prisma.Decimal(freightAmount).plus(demurrageAmount);

  let total = new Prisma.Decimal(0);
  const expenseByType: Record<string, string> = {};
  for (const e of expenses) {
    const amt = new Prisma.Decimal(e.amount);
    total = total.plus(amt);
    expenseByType[e.type] = new Prisma.Decimal(expenseByType[e.type] ?? 0)
      .plus(amt)
      .toString();
  }

  const profit = revenue.minus(total);
  const marginPct = revenue.greaterThan(0)
    ? profit.dividedBy(revenue).times(100)
    : new Prisma.Decimal(0);

  return { revenue, expenses: total, profit, marginPct, expenseByType };
}

/**
 * Trip P&L = order revenue (freight + demurrage) − sum of trip expenses.
 * Reads the trip's own data; delegates the arithmetic to `tripPnL`.
 */
export async function computeTripPnL(tripId: string): Promise<TripPnL> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      order: { select: { freightAmount: true, demurrageAmount: true, currency: true } },
      expenses: { select: { type: true, amount: true } },
    },
  });
  if (!trip) throw new AuthError("Trip not found", 404);

  const figures = tripPnL(
    trip.order.freightAmount,
    trip.order.demurrageAmount,
    trip.expenses.map((e) => ({ type: e.type, amount: e.amount })),
  );

  return {
    tripId: trip.id,
    tripCode: trip.tripCode,
    currency: trip.order.currency,
    ...figures,
  };
}
