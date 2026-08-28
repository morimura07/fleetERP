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
  trips: { driverWages: Prisma.Decimal.Value; tollPermitCost: Prisma.Decimal.Value; miscExpense: Prisma.Decimal.Value; expenses: { amount: Prisma.Decimal.Value }[] }[];
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
      trips: { select: { driverWages: true, tollPermitCost: true, miscExpense: true, expenses: { select: { amount: true } } } },
    },
  });

  const pnl = corridorProfitability(orders);
  return {
    currency: "USD",
    rows: pnl.rows.map(serializeRow),
    total: serializeRow(pnl.total),
  };
}

// ── Corridor drill-down (client amendments, Aug 2026) ────────────────────────

export interface CorridorOrderRow {
  orderId: string;
  orderCode: string;
  client: string;
  route: string;
  bookingDate: string;
  tripCount: number;
  revenue: string;
  cost: string;
  profit: string;
  marginPct: string;
}

export interface CorridorDetail {
  corridor: CorridorType;
  currency: string;
  orders: CorridorOrderRow[];
  /** Trip expenses on this corridor, grouped by type, largest first. */
  expenseByType: { type: string; amount: string; share: number }[];
  /** The base trip costs, which are not TripExpense rows and would otherwise be invisible. */
  baseCosts: { driverWages: string; tollPermits: string; misc: string };
  totals: { revenue: string; cost: string; profit: string; marginPct: string };
}

/**
 * One corridor, broken out to the order and expense-type level.
 *
 * The client asked to "click into each corridor and see the details of the
 * costing and expenses". Cost has two sources that are easy to confuse: the
 * base costs carried on the trip itself (driver wages, tolls, misc) and the
 * TripExpense rows logged against it. Both are reported, because a breakdown
 * that showed only expense rows would not reconcile with the headline cost.
 */
export async function getCorridorDetail(dataAreaId: string, corridor: CorridorType): Promise<CorridorDetail> {
  const orders = await prisma.order.findMany({
    where: { dataAreaId, corridor, status: { not: "CANCELLED" } },
    select: {
      id: true, orderCode: true, originZone: true, destinationZone: true, bookingDate: true,
      freightAmount: true, demurrageAmount: true,
      client: { select: { companyName: true } },
      trips: {
        select: {
          driverWages: true, tollPermitCost: true, miscExpense: true,
          expenses: { select: { type: true, amount: true } },
        },
      },
    },
    orderBy: { bookingDate: "desc" },
  });

  const zero = new Prisma.Decimal(0);
  const byType = new Map<string, Prisma.Decimal>();
  let wages = zero, tolls = zero, misc = zero;
  let totalRevenue = zero, totalCost = zero;

  const rows: CorridorOrderRow[] = orders.map((o) => {
    const { revenue, cost } = orderActuals(o);
    totalRevenue = totalRevenue.plus(revenue);
    totalCost = totalCost.plus(cost);

    for (const t of o.trips) {
      wages = wages.plus(t.driverWages);
      tolls = tolls.plus(t.tollPermitCost);
      misc = misc.plus(t.miscExpense);
      for (const e of t.expenses) {
        byType.set(e.type, (byType.get(e.type) ?? zero).plus(e.amount));
      }
    }

    const profit = revenue.minus(cost);
    return {
      orderId: o.id,
      orderCode: o.orderCode,
      client: o.client?.companyName ?? "",
      route: `${o.originZone} → ${o.destinationZone}`,
      bookingDate: o.bookingDate.toISOString().slice(0, 10),
      tripCount: o.trips.length,
      revenue: revenue.toFixed(2),
      cost: cost.toFixed(2),
      profit: profit.toFixed(2),
      marginPct: marginPct(profit, revenue).toFixed(2),
    };
  });

  const expenseTotal = [...byType.values()].reduce((s, v) => s.plus(v), zero);
  const expenseByType = [...byType.entries()]
    .sort((a, b) => b[1].comparedTo(a[1]))
    .map(([type, amount]) => ({
      type,
      amount: amount.toFixed(2),
      // Share of logged expenses, so the bars add to 100 regardless of base costs.
      share: expenseTotal.greaterThan(0)
        ? Math.round(amount.dividedBy(expenseTotal).times(1000).toNumber()) / 10
        : 0,
    }));

  const totalProfit = totalRevenue.minus(totalCost);
  return {
    corridor,
    currency: "USD",
    orders: rows,
    expenseByType,
    baseCosts: { driverWages: wages.toFixed(2), tollPermits: tolls.toFixed(2), misc: misc.toFixed(2) },
    totals: {
      revenue: totalRevenue.toFixed(2),
      cost: totalCost.toFixed(2),
      profit: totalProfit.toFixed(2),
      marginPct: marginPct(totalProfit, totalRevenue).toFixed(2),
    },
  };
}
