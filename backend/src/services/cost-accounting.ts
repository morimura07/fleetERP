import { Prisma, CorridorType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { orderActuals } from "@backend/services/projects";

/**
 * Cost accounting (M6) — per-corridor profitability. Groups freight orders by
 * their corridor (Northern / Central / Domestic) and rolls up revenue, cost and
 * margin per route, reusing the same order-level actuals as Trip P&L (revenue =
 * freight + demurrage; cost = the linked trip's base costs + expenses). The
 * grouping arithmetic is a pure, unit-tested function.
 */

export interface CorridorPnLRow {
  corridor: CorridorType;
  orderCount: number;
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
  profit: Prisma.Decimal; // revenue − cost
  marginPct: Prisma.Decimal; // profit / revenue * 100, 0 when no revenue
}

export interface CorridorPnL {
  rows: CorridorPnLRow[]; // one per corridor that has at least one order, highest profit first
  total: Omit<CorridorPnLRow, "corridor">;
}

type OrderRow = {
  corridor: CorridorType;
  freightAmount: Prisma.Decimal.Value;
  demurrageAmount: Prisma.Decimal.Value;
  trip: { driverWages: Prisma.Decimal.Value; tollPermitCost: Prisma.Decimal.Value; miscExpense: Prisma.Decimal.Value; expenses: { amount: Prisma.Decimal.Value }[] } | null;
};

function marginPct(profit: Prisma.Decimal, revenue: Prisma.Decimal): Prisma.Decimal {
  return revenue.greaterThan(0) ? profit.dividedBy(revenue).times(100) : new Prisma.Decimal(0);
}

/**
 * Group orders by corridor and total revenue/cost/profit/margin per corridor,
 * plus an overall total. Pure — no Prisma access. Corridors with no orders are
 * omitted; rows are ordered by profit descending.
 */
export function corridorProfitability(orders: OrderRow[]): CorridorPnL {
  const groups = new Map<CorridorType, { orderCount: number; revenue: Prisma.Decimal; cost: Prisma.Decimal }>();

  let tRevenue = new Prisma.Decimal(0), tCost = new Prisma.Decimal(0), tCount = 0;
  for (const o of orders) {
    const { revenue, cost } = orderActuals(o);
    const g = groups.get(o.corridor) ?? { orderCount: 0, revenue: new Prisma.Decimal(0), cost: new Prisma.Decimal(0) };
    g.orderCount += 1;
    g.revenue = g.revenue.plus(revenue);
    g.cost = g.cost.plus(cost);
    groups.set(o.corridor, g);

    tRevenue = tRevenue.plus(revenue);
    tCost = tCost.plus(cost);
    tCount += 1;
  }

  const rows: CorridorPnLRow[] = [...groups.entries()].map(([corridor, g]) => {
    const profit = g.revenue.minus(g.cost);
    return { corridor, orderCount: g.orderCount, revenue: g.revenue, cost: g.cost, profit, marginPct: marginPct(profit, g.revenue) };
  });
  rows.sort((a, b) => b.profit.comparedTo(a.profit));

  const totalProfit = tRevenue.minus(tCost);
  return {
    rows,
    total: {
      orderCount: tCount,
      revenue: tRevenue,
      cost: tCost,
      profit: totalProfit,
      marginPct: marginPct(totalProfit, tRevenue),
    },
  };
}

/** Serialize a P&L row's Decimals to fixed-2 strings for the JSON response. */
function serializeRow<T extends { revenue: Prisma.Decimal; cost: Prisma.Decimal; profit: Prisma.Decimal; marginPct: Prisma.Decimal }>(r: T) {
  return { ...r, revenue: r.revenue.toFixed(2), cost: r.cost.toFixed(2), profit: r.profit.toFixed(2), marginPct: r.marginPct.toFixed(1) };
}

export interface CorridorPnLResponse {
  currency: string;
  rows: (Omit<CorridorPnLRow, "revenue" | "cost" | "profit" | "marginPct"> & { revenue: string; cost: string; profit: string; marginPct: string })[];
  total: Omit<CorridorPnL["total"], "revenue" | "cost" | "profit" | "marginPct"> & { revenue: string; cost: string; profit: string; marginPct: string };
}

/** Per-corridor profitability for an entity. Excludes cancelled orders. */
export async function getCorridorProfitability(dataAreaId: string): Promise<CorridorPnLResponse> {
  const orders = await prisma.order.findMany({
    where: { dataAreaId, status: { not: "CANCELLED" } },
    select: {
      corridor: true,
      freightAmount: true,
      demurrageAmount: true,
      trip: { select: { driverWages: true, tollPermitCost: true, miscExpense: true, expenses: { select: { amount: true } } } },
    },
  });

  const pnl = corridorProfitability(orders);
  return {
    currency: "USD",
    rows: pnl.rows.map(serializeRow),
    total: serializeRow(pnl.total),
  };
}
