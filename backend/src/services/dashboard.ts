import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  onTimeDeliveryPct, avgTransitHours, fillRatePct,
  costPerKm, revenuePerKm, freightCostPerShipment, emptyLoadRatePct,
  fuelEfficiencyKmPerL, maintenanceCostPerKm, breakdownRate,
  driverTurnoverPct, billingAccuracyPct, arRecoveryPct,
  avgTurnaroundHours, damageRatePct, avgCsat, computeNps,
  otifPct, avgInvoiceProcessingDays, vehicleTco, avgTcoPerVehicle,
} from "@backend/services/dashboard-kpi";
import { computePlanVsActual } from "@backend/services/planning";

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

// ── Logistics KPI dashboard, grouped into the client's 5 categories ─────────

export interface KpiTile {
  key: string;
  label: string;
  value: string; // formatted display value
  unit?: string; // % · USD · km/L …
  href?: string; // drill-down link (clickable tile)
  hint?: string; // one-line explanation
}
export interface KpiCategory {
  key: string;
  title: string;
  tiles: KpiTile[];
}
export interface KpiDashboard {
  asOf: string;
  currency: string;
  categories: KpiCategory[];
}

export async function getKpiDashboard(dataAreaId = "HQ01"): Promise<KpiDashboard> {
  const now = new Date();
  const [orders, trips, maint, drivers, invoices, vehicles, dockEvents, damageReports, feedback] = await Promise.all([
    prisma.order.findMany({
      where: { dataAreaId, status: { not: "CANCELLED" } },
      select: {
        status: true, eta: true, freightAmount: true, demurrageAmount: true, grossWeightKg: true,
        trips: { select: { actualEnd: true } },
        // OTIF needs to know whether anything was reported damaged against the
        // order; invoice processing time needs when the AR entry was posted.
        _count: { select: { damageReports: true } },
        invoiceEntry: { select: { postingDate: true } },
      },
    }),
    prisma.trip.findMany({
      where: { dataAreaId },
      select: {
        status: true, mileageKm: true, transitHours: true, fuelLitres: true, orderId: true,
        driverWages: true, tollPermitCost: true, miscExpense: true,
        vehicle: { select: { gvwKg: true, payloadKg: true } },
        expenses: { select: { amount: true } },
      },
    }),
    prisma.vehicleMaintenance.findMany({ where: { dataAreaId }, select: { cost: true } }),
    prisma.driver.findMany({ where: { dataAreaId }, select: { status: true } }),
    prisma.customerInvoice.findMany({ where: { dataAreaId, status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] } }, select: { total: true, paidAmount: true, disputeStatus: true } }),
    prisma.vehicle.count({ where: { dataAreaId } }),
    prisma.dockEvent.findMany({ where: { dataAreaId }, select: { vehicleId: true, kind: true, eventAt: true } }),
    prisma.damageReport.findMany({ where: { dataAreaId }, select: { damageValue: true, cargoValue: true } }),
    prisma.customerFeedback.findMany({ where: { dataAreaId }, select: { csat: true, nps: true } }),
  ]);

  // Distance & fuel totals across trips.
  let totalKm = new Prisma.Decimal(0), totalLitres = new Prisma.Decimal(0);
  let tripCost = new Prisma.Decimal(0);
  let emptyTrips = 0;
  const completedTrips = trips.filter((t) => t.status === "COMPLETED");
  for (const t of trips) {
    totalKm = totalKm.plus(t.mileageKm);
    if (t.fuelLitres) totalLitres = totalLitres.plus(t.fuelLitres);
    const exp = t.expenses.reduce((s, e) => s.plus(e.amount), new Prisma.Decimal(0));
    tripCost = tripCost.plus(exp).plus(t.driverWages).plus(t.tollPermitCost).plus(t.miscExpense);
    if (!t.orderId) emptyTrips++;
  }

  // Revenue on delivered/invoiced orders.
  let revenue = new Prisma.Decimal(0);
  const delivered = orders.filter((o) => ["DELIVERED", "INVOICED"].includes(o.status));
  for (const o of delivered) revenue = revenue.plus(o.freightAmount).plus(o.demurrageAmount);

  // Maintenance cost total (¥ stored as Int in the legacy model — treated as amount).
  const maintCost = maint.reduce((s, m) => s.plus(m.cost), new Prisma.Decimal(0));

  // OTD data: delivered orders with an ETA and an actual delivery (trip.actualEnd).
  // An order spread over several trucks is only delivered once the LAST one
  // arrives, so on-time is judged against the latest actualEnd. Any leg still
  // running leaves the order undelivered rather than counting it early.
  const otdOrders = delivered.map((o) => {
    const ends = o.trips.map((t) => t.actualEnd);
    const actualDelivery = ends.length > 0 && ends.every((e) => e != null)
      ? new Date(Math.max(...ends.map((e) => (e as Date).getTime())))
      : null;
    return { eta: o.eta, actualDelivery };
  });

  // OTIF reuses the same delivery timing but also requires nothing to have been
  // reported damaged against the order.
  const otifOrders = delivered.map((o, i) => ({
    eta: otdOrders[i].eta,
    actualDelivery: otdOrders[i].actualDelivery,
    hasDamage: o._count.damageReports > 0,
  }));

  // Invoice processing time: delivery → the AR entry's posting date.
  const invoiceLag = delivered.map((o, i) => ({
    deliveredAt: otdOrders[i].actualDelivery,
    invoicedAt: o.invoiceEntry?.postingDate ?? null,
  }));

  // Operating TCO across the fleet. Depreciation is excluded because FixedAsset
  // has no link to Vehicle — see vehicleTco().
  const tripRunningCost = trips.reduce(
    (sum, t) => sum.plus(t.tollPermitCost).plus(t.miscExpense).plus(
      t.expenses.reduce((e, x) => e.plus(x.amount), new Prisma.Decimal(0)),
    ),
    new Prisma.Decimal(0),
  );
  const fleetTco = vehicleTco({ maintenance: maintCost, fuel: 0, tolls: tripRunningCost, other: 0 });
  // Fill rate: Σ order gross weight vs Σ payload of vehicles that ran a laden trip.
  const totalOrderWeight = orders.reduce((s, o) => s.plus(o.grossWeightKg), new Prisma.Decimal(0));
  const totalPayload = trips.reduce((s, t) => s.plus(t.orderId ? (t.vehicle?.payloadKg ?? 0) : 0), new Prisma.Decimal(0));

  // Invoice recovery & billing accuracy.
  let invoiced = new Prisma.Decimal(0), paid = new Prisma.Decimal(0), disputed = 0;
  for (const i of invoices) {
    invoiced = invoiced.plus(i.total);
    paid = paid.plus(i.paidAmount);
    if (i.disputeStatus !== "NONE") disputed++;
  }

  const terminated = drivers.filter((d) => d.status === "INACTIVE").length;
  const busy = new Set(trips.filter((t) => ["DISPATCHED", "IN_PROGRESS"].includes(t.status)).map((t) => t.orderId)).size;

  // Tier C internal KPIs. Damage rate uses the cargo value logged on the damage
  // reports themselves as the denominator (no separate shipment-value ledger).
  const turnaround = avgTurnaroundHours(dockEvents.map((e) => ({ vehicleId: e.vehicleId, kind: e.kind, eventAt: e.eventAt })));
  const totalCargoValue = damageReports.reduce((s, r) => s.plus(r.cargoValue), new Prisma.Decimal(0));
  const damageRate = damageRatePct(damageReports, totalCargoValue);
  const csat = avgCsat(feedback);
  const nps = computeNps(feedback);

  const cats: KpiCategory[] = [
    {
      key: "operational", title: "Operational & Delivery",
      tiles: [
        { key: "otd", label: "On-Time Delivery", value: String(onTimeDeliveryPct(otdOrders)), unit: "%", href: "/orders", hint: "Delivered on/before committed ETA" },
        { key: "otif", label: "On-Time In-Full", value: String(otifPct(otifOrders)), unit: "%", href: "/orders", hint: "On time AND with nothing reported damaged" },
        { key: "transit", label: "Avg Transit Time", value: avgTransitHours(completedTrips), unit: "h", href: "/trips", hint: "Mean transit hours on completed trips" },
        { key: "fill", label: "Load Fill Rate", value: String(fillRatePct([{ cargoKg: totalOrderWeight, capacityKg: totalPayload }])), unit: "%", href: "/trips", hint: "Cargo weight vs available payload" },
        { key: "turnaround", label: "Truck Turnaround", value: turnaround, unit: "h", href: "/dock-events", hint: "Mean arrival→departure gap at facilities" },
        { key: "damage", label: "Damage & Claim Rate", value: String(damageRate), unit: "%", href: "/damage-reports", hint: "Damage value ÷ cargo value" },
        { key: "deliveries", label: "Delivered Orders", value: String(delivered.length), href: "/orders", hint: "Orders delivered or invoiced" },
      ],
    },
    {
      key: "cost", title: "Cost & Profitability",
      tiles: [
        { key: "cpk", label: "Cost per km", value: costPerKm(tripCost, totalKm), unit: "USD", href: "/trips", hint: "Trip cost ÷ distance" },
        { key: "rpk", label: "Revenue per km", value: revenuePerKm(revenue, totalKm), unit: "USD", href: "/orders", hint: "Revenue ÷ distance" },
        { key: "fcps", label: "Freight Cost / Shipment", value: freightCostPerShipment(tripCost, trips.length || 1), unit: "USD", href: "/trips", hint: "Total cost ÷ shipments" },
        { key: "empty", label: "Empty-Load Rate", value: String(emptyLoadRatePct(emptyTrips, trips.length)), unit: "%", href: "/trips", hint: "Deadhead trips ÷ all trips" },
      ],
    },
    {
      key: "fleet", title: "Fleet & Asset Utilization",
      tiles: [
        { key: "util", label: "Asset Utilization", value: String(pctInt(busy, vehicles)), unit: "%", href: "/vehicles", hint: "Vehicles on an active trip ÷ fleet" },
        { key: "fuel", label: "Fuel Efficiency", value: fuelEfficiencyKmPerL(totalKm, totalLitres), unit: "km/L", href: "/vehicles", hint: "Distance ÷ litres consumed" },
        { key: "maintkm", label: "Maintenance / km", value: maintenanceCostPerKm(maintCost, totalKm), unit: "USD", href: "/service", hint: "Maintenance cost ÷ distance" },
        { key: "breakdown", label: "Breakdown Rate", value: breakdownRate(maint.length, totalKm), unit: "/10k km", href: "/service", hint: "Maintenance events per 10,000 km" },
        { key: "tco", label: "Operating Cost / Vehicle", value: avgTcoPerVehicle(fleetTco, vehicles), unit: "USD", href: "/vehicles", hint: "Maintenance + tolls + trip expenses ÷ fleet size (excludes depreciation)" },
      ],
    },
    {
      key: "driver", title: "Driver & Safety",
      tiles: [
        { key: "active", label: "Active Drivers", value: String(drivers.filter((d) => d.status === "ACTIVE").length), href: "/drivers", hint: "Drivers currently active" },
        { key: "turnover", label: "Driver Turnover", value: String(driverTurnoverPct(terminated, drivers.length)), unit: "%", href: "/drivers", hint: "Inactive ÷ total headcount" },
        { key: "headcount", label: "Total Drivers", value: String(drivers.length), href: "/drivers" },
      ],
    },
    {
      key: "backoffice", title: "Customer Service & Back-Office",
      tiles: [
        { key: "billing", label: "Billing Accuracy", value: String(billingAccuracyPct(disputed, invoices.length)), unit: "%", href: "/receivables", hint: "Invoices with no dispute" },
        { key: "recovery", label: "AR Recovery", value: String(arRecoveryPct(paid, invoiced)), unit: "%", href: "/collections", hint: "Collected ÷ invoiced" },
        { key: "invlag", label: "Invoice Processing Time", value: avgInvoiceProcessingDays(invoiceLag), unit: "days", href: "/receivables", hint: "Delivery → AR invoice posted" },
        { key: "outstanding", label: "Outstanding AR", value: invoiced.minus(paid).toFixed(2), unit: "USD", href: "/collections", hint: "Invoiced − collected" },
        { key: "csat", label: "CSAT", value: csat, unit: "/5", href: "/feedback", hint: "Average customer satisfaction score" },
        { key: "nps", label: "NPS", value: String(nps), href: "/feedback", hint: "Promoters − detractors (−100…100)" },
      ],
    },
  ];

  // Master Planning result for the current month (client review: "that data can
  // be seen on dashboard"). Only shown once a forecast exists for the period —
  // an empty plan would render a row of zeroes that means nothing.
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const planned = await computePlanVsActual(dataAreaId, period);
  if (planned.lines.length > 0) {
    cats.push({
      key: "planning",
      title: `Plan vs Actual (${period})`,
      tiles: [
        { key: "forecastLoads", label: "Forecast Loads", value: String(planned.totalForecastLoads), href: "/planning", hint: "Confirmed demand for this month" },
        { key: "actualLoads", label: "Actual Loads", value: String(planned.totalActualLoads), href: "/planning", hint: "Orders booked this month" },
        { key: "loadAchieved", label: "Loads Achieved", value: String(planned.loadAchievedPct), unit: "%", href: "/planning", hint: "Actual ÷ forecast loads" },
        { key: "forecastTonnes", label: "Forecast Tonnes", value: planned.totalForecastTonnes.toFixed(2), unit: "t", href: "/planning" },
        { key: "actualTonnes", label: "Actual Tonnes", value: planned.totalActualTonnes.toFixed(2), unit: "t", href: "/planning", hint: "Gross weight moved this month" },
        { key: "tonneAchieved", label: "Tonnes Achieved", value: String(planned.tonneAchievedPct), unit: "%", href: "/planning", hint: "Actual ÷ forecast tonnage" },
      ],
    });
  }

  return { asOf: now.toISOString().slice(0, 10), currency: "USD", categories: cats };
}

function pctInt(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}
