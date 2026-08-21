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

/**
 * OTIF — on-time **and** in-full.
 *
 * Stricter than on-time delivery: an order counts only if it arrived by the
 * committed ETA *and* nothing was reported damaged or short against it. A
 * shipment that lands on time but half-crushed is not a success, which is the
 * whole reason the client asked for OTIF alongside OTD.
 *
 * Orders with no ETA are excluded — there is no commitment to measure against.
 */
export function otifPct(
  orders: { eta: Date | null; actualDelivery: Date | null; hasDamage: boolean }[],
): number {
  const measured = orders.filter((o) => o.eta && o.actualDelivery);
  if (measured.length === 0) return 0;
  const good = measured.filter((o) => o.actualDelivery! <= o.eta! && !o.hasDamage).length;
  return pct(good, measured.length);
}

/**
 * Average days from delivery to the AR invoice being posted.
 *
 * Measures back-office lag, not operations: how long cash sits uninvoiced after
 * the cargo has landed. Only orders that have both a delivery and a posted
 * invoice are counted; anything still uninvoiced has no elapsed time yet.
 */
export function avgInvoiceProcessingDays(
  orders: { deliveredAt: Date | null; invoicedAt: Date | null }[],
): string {
  const measured = orders.filter((o) => o.deliveredAt && o.invoicedAt);
  if (measured.length === 0) return "0.0";
  const totalDays = measured.reduce((sum, o) => {
    const ms = o.invoicedAt!.getTime() - o.deliveredAt!.getTime();
    // An invoice posted before delivery (back-dated) contributes 0 rather than
    // a negative that would flatter the average.
    return sum + Math.max(0, ms) / 86_400_000;
  }, 0);
  return (totalDays / measured.length).toFixed(1);
}

/**
 * Total cost of ownership for one vehicle, or for the fleet.
 *
 * Sums what it actually costs to own and run the truck: maintenance and workshop
 * work, the fuel, tolls and incidental costs recorded against its trips, and the
 * depreciation charged on the linked asset-register entry.
 *
 * `depreciation` is whatever has accumulated on the `FixedAsset` pointing at the
 * vehicle. A truck with no asset row contributes zero there — that is a missing
 * link in the register rather than a free truck, so `tcoCoverage()` reports how
 * much of the fleet is actually accounted for.
 */
export function vehicleTco(costs: {
  maintenance: Prisma.Decimal.Value;
  fuel: Prisma.Decimal.Value;
  tolls: Prisma.Decimal.Value;
  other: Prisma.Decimal.Value;
  depreciation?: Prisma.Decimal.Value;
}): Prisma.Decimal {
  return D(costs.maintenance)
    .plus(costs.fuel)
    .plus(costs.tolls)
    .plus(costs.other)
    .plus(costs.depreciation ?? 0);
}

/**
 * Share of the fleet whose depreciation is actually known, as a percentage.
 *
 * TCO is only trustworthy to the extent that trucks are linked to the asset
 * register. Reporting the number without this would quietly understate cost
 * whenever somebody forgets to link a new vehicle.
 */
export function tcoCoverage(linkedVehicles: number, totalVehicles: number): number {
  return pct(linkedVehicles, totalVehicles);
}

/** Fleet-wide TCO per vehicle — total operating cost ÷ number of vehicles. */
export function avgTcoPerVehicle(total: Prisma.Decimal.Value, vehicleCount: number): string {
  if (vehicleCount <= 0) return "0.00";
  return D(total).dividedBy(vehicleCount).toFixed(2);
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

// ── Tier C internal KPIs ────────────────────────────────────────────────────

/**
 * Average truck-turnaround hours: for each arrival→departure pair at a facility,
 * the gap between them, meaned. Pairs are matched per vehicle in arrival order.
 * Pure — takes already-sorted (vehicle, kind, eventAt) rows. Unit-tested.
 */
export function avgTurnaroundHours(
  events: { vehicleId: string; kind: "ARRIVAL" | "DEPARTURE"; eventAt: Date }[],
): string {
  // Group by vehicle, then pair each ARRIVAL with the next DEPARTURE after it.
  const byVehicle = new Map<string, { kind: string; at: number }[]>();
  for (const e of events) {
    if (!byVehicle.has(e.vehicleId)) byVehicle.set(e.vehicleId, []);
    byVehicle.get(e.vehicleId)!.push({ kind: e.kind, at: e.eventAt.getTime() });
  }
  let totalMs = 0, pairs = 0;
  for (const list of byVehicle.values()) {
    list.sort((a, b) => a.at - b.at);
    let pendingArrival: number | null = null;
    for (const ev of list) {
      if (ev.kind === "ARRIVAL") pendingArrival = ev.at;
      else if (ev.kind === "DEPARTURE" && pendingArrival != null) {
        totalMs += ev.at - pendingArrival;
        pairs++;
        pendingArrival = null;
      }
    }
  }
  if (pairs === 0) return "0.0";
  return (totalMs / pairs / 3_600_000).toFixed(1);
}

/** Damage & claim rate %: Σ damage value ÷ Σ cargo value transported. Pure. */
export function damageRatePct(
  reports: { damageValue: Prisma.Decimal.Value }[],
  totalCargoValue: Prisma.Decimal.Value,
): number {
  const dmg = reports.reduce((s, r) => s.plus(r.damageValue), new Prisma.Decimal(0));
  return pct(dmg, totalCargoValue);
}

/** Average CSAT (1–5) across feedback rows with a score, to 1dp. Pure. */
export function avgCsat(feedback: { csat: number | null }[]): string {
  const scored = feedback.filter((f) => f.csat != null) as { csat: number }[];
  if (scored.length === 0) return "0.0";
  return (scored.reduce((s, f) => s + f.csat, 0) / scored.length).toFixed(1);
}

/**
 * Net Promoter Score = %promoters (9–10) − %detractors (0–6), rounded to an
 * integer, over feedback rows with an NPS score. Range −100…100. Pure.
 */
export function computeNps(feedback: { nps: number | null }[]): number {
  const scored = feedback.filter((f) => f.nps != null) as { nps: number }[];
  if (scored.length === 0) return 0;
  const promoters = scored.filter((f) => f.nps >= 9).length;
  const detractors = scored.filter((f) => f.nps <= 6).length;
  return Math.round(((promoters - detractors) / scored.length) * 100);
}
