import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";

export interface DashboardStats {
  todayJobs: number;
  delivering: number;
  completedToday: number;
  activeDrivers: number;
  availableVehicles: number;
  revenueThisMonth: number;
  monthlySeries: { month: string; revenue: number; jobs: number }[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [
    todayJobs,
    delivering,
    completedToday,
    activeDrivers,
    availableVehicles,
    monthRevenue,
  ] = await Promise.all([
    prisma.deliveryJob.count({ where: { deliveryDate: { gte: todayStart, lt: todayEnd } } }),
    prisma.deliveryJob.count({ where: { status: "DELIVERING" } }),
    prisma.deliveryJob.count({
      where: { status: "COMPLETED", updatedAt: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.driver.count({ where: { status: "ACTIVE" } }),
    prisma.vehicle.count({ where: { status: "AVAILABLE" } }),
    prisma.deliveryJob.aggregate({
      _sum: { rewardAmount: true },
      where: { status: "COMPLETED", deliveryDate: { gte: monthStart, lt: nextMonth } },
    }),
  ]);

  // Last 6 months revenue + job counts.
  const series: DashboardStats["monthlySeries"] = [];
  for (let i = 5; i >= 0; i--) {
    const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const agg = await prisma.deliveryJob.aggregate({
      _sum: { rewardAmount: true },
      _count: true,
      where: { status: "COMPLETED", deliveryDate: { gte: s, lt: e } },
    });
    series.push({
      month: `${s.getFullYear()}/${s.getMonth() + 1}`,
      revenue: agg._sum.rewardAmount ?? 0,
      jobs: agg._count,
    });
  }

  return {
    todayJobs,
    delivering,
    completedToday,
    activeDrivers,
    availableVehicles,
    revenueThisMonth: monthRevenue._sum.rewardAmount ?? 0,
    monthlySeries: series,
  };
}

// ───────────────────────── Executive dashboard (PRD §8) ─────────────────────────

export interface ExecutiveStats {
  // §8.1 KPI cards
  activeVehicles: number;
  totalFleet: number;
  activeDrivers: number;
  totalDrivers: number;
  assetUtilizationPct: number; // vehicles on an active trip / total fleet
  totalBookings: number;
  totalBookingValue: string; // freight + demurrage of non-cancelled orders
  invoicedRevenue: string; // revenue posted to A/R (INVOICED orders)
  tripProfit: string; // Σ trip revenue − Σ trip expenses (posted)
  currency: string;
  // §8.2 gauges — two-segment splits {green, red}
  customerRecovery: { invoiced: string; pending: string };
  supplierObligations: { posted: string; unposted: string };
  // §8.3 compliance — vehicle document lifecycle buckets
  compliance: { current: number; expiringSoon: number; expired: number };
}

const dec = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);

export async function getExecutiveStats(): Promise<ExecutiveStats> {
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 86_400_000); // 14-day warning window (PRD §7)

  const [
    totalFleet,
    activeTrips,
    totalDrivers,
    activeDrivers,
    orders,
    invoicedOrders,
    expenseAgg,
    vehicles,
  ] = await Promise.all([
    prisma.vehicle.count(),
    prisma.trip.findMany({
      where: { status: { in: ["DISPATCHED", "IN_PROGRESS"] } },
      select: { vehicleId: true, order: { select: { freightAmount: true, demurrageAmount: true } } },
    }),
    prisma.driver.count(),
    prisma.driver.count({ where: { status: "ACTIVE" } }),
    prisma.order.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { freightAmount: true, demurrageAmount: true, status: true },
    }),
    prisma.order.findMany({
      where: { status: "INVOICED" },
      select: { freightAmount: true, demurrageAmount: true },
    }),
    prisma.tripExpense.findMany({ select: { amount: true, entryId: true } }),
    prisma.vehicle.findMany({ select: { insuranceExpiry: true, inspectionExpiry: true } }),
  ]);

  // Bookings — total contracted value across active orders.
  let totalBookingValue = new Prisma.Decimal(0);
  let invoiced = new Prisma.Decimal(0);
  let pending = new Prisma.Decimal(0);
  for (const o of orders) {
    const v = dec(o.freightAmount).plus(o.demurrageAmount);
    totalBookingValue = totalBookingValue.plus(v);
    if (o.status === "INVOICED") invoiced = invoiced.plus(v);
    else pending = pending.plus(v);
  }

  // Invoiced revenue (posted to A/R).
  let invoicedRevenue = new Prisma.Decimal(0);
  for (const o of invoicedOrders) {
    invoicedRevenue = invoicedRevenue.plus(dec(o.freightAmount)).plus(o.demurrageAmount);
  }

  // Supplier obligations — posted (in A/P) vs recorded-but-unposted expenses.
  let postedExp = new Prisma.Decimal(0);
  let unpostedExp = new Prisma.Decimal(0);
  for (const e of expenseAgg) {
    if (e.entryId) postedExp = postedExp.plus(e.amount);
    else unpostedExp = unpostedExp.plus(e.amount);
  }

  // Trip profit — invoiced revenue minus posted expenses (approx. realised P&L).
  const tripProfit = invoicedRevenue.minus(postedExp);

  // Asset utilization — distinct vehicles on an active trip / fleet.
  const busyVehicles = new Set(activeTrips.map((t) => t.vehicleId)).size;
  const assetUtilizationPct = totalFleet > 0 ? Math.round((busyVehicles / totalFleet) * 100) : 0;

  // Compliance buckets — earliest of insurance / inspection expiry per vehicle.
  let current = 0, expiringSoon = 0, expired = 0;
  for (const v of vehicles) {
    const earliest = v.insuranceExpiry < v.inspectionExpiry ? v.insuranceExpiry : v.inspectionExpiry;
    if (earliest < now) expired++;
    else if (earliest < soon) expiringSoon++;
    else current++;
  }

  return {
    activeVehicles: busyVehicles,
    totalFleet,
    activeDrivers,
    totalDrivers,
    assetUtilizationPct,
    totalBookings: orders.length,
    totalBookingValue: totalBookingValue.toString(),
    invoicedRevenue: invoicedRevenue.toString(),
    tripProfit: tripProfit.toString(),
    currency: "USD",
    customerRecovery: { invoiced: invoiced.toString(), pending: pending.toString() },
    supplierObligations: { posted: postedExp.toString(), unposted: unpostedExp.toString() },
    compliance: { current, expiringSoon, expired },
  };
}
