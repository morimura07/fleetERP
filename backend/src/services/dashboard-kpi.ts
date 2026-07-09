import { Prisma } from "@prisma/client";

/**
 * Logistics KPI formulas (client "ERP Features Updates" dashboard spec), grouped
 * into the five categories the client asked for. Pure functions so they are
 * unit-tested directly; the impure `getKpiDashboard` in dashboard.ts feeds them
 * with aggregated data.
 *
 * Metrics that need event data we don't yet capture (dock in/out for turnaround,
 * telematics idle feed, damage logging, CSAT survey) are intentionally absent —
 * see the gap analysis; those are gated on new capture / integrations.
 */

const D = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);

/** Percentage a/b, rounded to 1dp, 0 when b is 0. */
export function pct(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): number {
  const bb = D(b);
  if (bb.lessThanOrEqualTo(0)) return 0;
  return Math.round(D(a).dividedBy(bb).times(1000).toNumber()) / 10;
}

/** Ratio a/b to `dp` decimals, "0" when b is 0. */
export function ratio(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value, dp = 2): string {
  const bb = D(b);
  if (bb.lessThanOrEqualTo(0)) return (0).toFixed(dp);
  return D(a).dividedBy(bb).toFixed(dp);
}

// ── 1. Operational & delivery ───────────────────────────────────────────────

/** On-time delivery %: delivered orders whose actual delivery ≤ committed ETA. */
export function onTimeDeliveryPct(orders: { eta: Date | null; actualDelivery: Date | null }[]): number {
  const measured = orders.filter((o) => o.eta && o.actualDelivery);
  if (measured.length === 0) return 0;
  const onTime = measured.filter((o) => o.actualDelivery! <= o.eta!).length;
  return pct(onTime, measured.length);
}

/** Average transit hours across completed trips (uses actual if present, else scheduled). */
export function avgTransitHours(trips: { transitHours: Prisma.Decimal.Value }[]): string {
  if (trips.length === 0) return "0.0";
  const total = trips.reduce((s, t) => s.plus(t.transitHours), new Prisma.Decimal(0));
  return total.dividedBy(trips.length).toFixed(1);
}

/** Load-capacity fill rate %: Σ cargo weight ÷ Σ vehicle payload capacity used. */
export function fillRatePct(loads: { cargoKg: Prisma.Decimal.Value; capacityKg: Prisma.Decimal.Value }[]): number {
  let cargo = new Prisma.Decimal(0), cap = new Prisma.Decimal(0);
  for (const l of loads) {
    const c = D(l.capacityKg);
    if (c.lessThanOrEqualTo(0)) continue;
    cargo = cargo.plus(l.cargoKg);
    cap = cap.plus(c);
  }
  return pct(cargo, cap);
}

// ── 2. Cost & profitability ─────────────────────────────────────────────────

/** Cost per km = total trip cost ÷ total distance. */
export function costPerKm(totalCost: Prisma.Decimal.Value, totalKm: Prisma.Decimal.Value): string {
  return ratio(totalCost, totalKm, 2);
}

/** Revenue per km = total revenue ÷ total distance. */
export function revenuePerKm(totalRevenue: Prisma.Decimal.Value, totalKm: Prisma.Decimal.Value): string {
  return ratio(totalRevenue, totalKm, 2);
}

/** Freight cost per shipment = total cost ÷ shipment count. */
export function freightCostPerShipment(totalCost: Prisma.Decimal.Value, shipments: number): string {
  return ratio(totalCost, shipments, 2);
}

/** Empty-load (deadhead) rate %: trips with no order/cargo ÷ all trips. */
export function emptyLoadRatePct(emptyTrips: number, totalTrips: number): number {
  return pct(emptyTrips, totalTrips);
}

// ── 3. Fleet & asset utilization ────────────────────────────────────────────

/** Fuel efficiency km/L = total distance ÷ total litres. */
export function fuelEfficiencyKmPerL(totalKm: Prisma.Decimal.Value, totalLitres: Prisma.Decimal.Value): string {
  return ratio(totalKm, totalLitres, 2);
}

/** Maintenance cost per km = total maintenance cost ÷ total distance. */
export function maintenanceCostPerKm(totalMaintCost: Prisma.Decimal.Value, totalKm: Prisma.Decimal.Value): string {
  return ratio(totalMaintCost, totalKm, 2);
}

/** Breakdown rate: unexpected maintenance events per 10,000 km. */
export function breakdownRate(events: number, totalKm: Prisma.Decimal.Value): string {
  const km = D(totalKm);
  if (km.lessThanOrEqualTo(0)) return "0.00";
  return D(events).times(10000).dividedBy(km).toFixed(2);
}

// ── 4. Driver & safety ──────────────────────────────────────────────────────

/** Driver turnover %: terminated drivers ÷ total headcount. */
export function driverTurnoverPct(terminated: number, headcount: number): number {
  return pct(terminated, headcount);
}

// ── 5. Customer service & back-office ───────────────────────────────────────

/** Freight billing accuracy %: invoices with no dispute ÷ all invoices. */
export function billingAccuracyPct(disputed: number, totalInvoices: number): number {
  if (totalInvoices === 0) return 100;
  return pct(totalInvoices - disputed, totalInvoices);
}

/** AR recovery %: collected (paid) ÷ total invoiced. */
export function arRecoveryPct(paid: Prisma.Decimal.Value, invoiced: Prisma.Decimal.Value): number {
  return pct(paid, invoiced);
}
