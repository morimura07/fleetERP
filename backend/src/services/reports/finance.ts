import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { areaScope } from "@backend/lib/scope";
import { defineReport } from "@backend/services/report-registry";
import { costPerKm, revenuePerKm, otifPct, pct, vehicleTco } from "@backend/services/dashboard-kpi";

/**
 * Transport finance and executive reports.
 *
 * These assemble figures the system already computes rather than inventing new
 * ones: the per-kilometre and OTIF maths in dashboard-kpi.ts is unit-tested and
 * drives the dashboard, so a report disagreeing with the dashboard is not
 * possible by construction.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal) => v.toDecimalPlaces(2).toNumber();

/** Trips finished inside the window, with everything the costings need. */
function tripWindow(ctx: { dataAreaId: string; from: Date | null; to: Date | null }) {
  return {
    dataAreaId: ctx.dataAreaId,
    status: "COMPLETED" as const,
    ...(ctx.from || ctx.to
      ? { actualEnd: { ...(ctx.from ? { gte: ctx.from } : {}), ...(ctx.to ? { lte: ctx.to } : {}) } }
      : {}),
  };
}

// ── Cost per kilometre ───────────────────────────────────────────────────────

interface CostPerKmRow {
  vehicleNumber: string;
  plateNumber: string;
  trips: number;
  distanceKm: number;
  fixedCost: number;
  variableCost: number;
  totalCost: number;
  costPerKm: number;
}

export const costPerKmReport = defineReport<CostPerKmRow>({
  key: "cost-per-km",
  title: "Cost per kilometre",
  group: "FINANCE",
  description: "Operating cost per kilometre by vehicle, split into fixed and variable.",
  permission: "report:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
  ],
  columns: [
    { header: "Vehicle", value: (r) => r.vehicleNumber, width: 14 },
    { header: "Plate", value: (r) => r.plateNumber, width: 14 },
    { header: "Trips", value: (r) => r.trips, width: 8 },
    { header: "Distance (km)", value: (r) => r.distanceKm, width: 13 },
    { header: "Fixed cost", value: (r) => r.fixedCost, width: 12 },
    { header: "Variable cost", value: (r) => r.variableCost, width: 13 },
    { header: "Total cost", value: (r) => r.totalCost, width: 12 },
    { header: "Cost per km", value: (r) => r.costPerKm, width: 12 },
  ],
  run: async (ctx) => {
    const trips = await prisma.trip.findMany({
      where: tripWindow(ctx),
      include: {
        vehicle: { select: { vehicleNumber: true, plateNumber: true } },
        expenses: { select: { amount: true } },
      },
    });

    const byVehicle = new Map<string, CostPerKmRow & { _distance: Prisma.Decimal }>();
    for (const t of trips) {
      const key = t.vehicleId;
      const row = byVehicle.get(key) ?? {
        vehicleNumber: t.vehicle.vehicleNumber,
        plateNumber: t.vehicle.plateNumber,
        trips: 0, distanceKm: 0, fixedCost: 0, variableCost: 0, totalCost: 0, costPerKm: 0,
        _distance: D(0),
      };

      // Driver wages are contracted per trip and tolls are a function of the
      // route, so both are fixed against the run. Fuel and the rest move with
      // how the trip actually went, which is what makes the split useful.
      const fixed = D(t.driverWages).plus(t.tollPermitCost);
      const variable = t.expenses.reduce((s, e) => s.plus(e.amount), D(0)).plus(t.miscExpense);

      row.trips += 1;
      row._distance = row._distance.plus(t.mileageKm);
      row.fixedCost = money(D(row.fixedCost).plus(fixed));
      row.variableCost = money(D(row.variableCost).plus(variable));
      byVehicle.set(key, row);
    }

    return [...byVehicle.values()]
      .map(({ _distance, ...r }) => {
        const total = D(r.fixedCost).plus(r.variableCost);
        return {
          ...r,
          distanceKm: _distance.toDecimalPlaces(2).toNumber(),
          totalCost: money(total),
          costPerKm: Number(costPerKm(total, _distance)),
        };
      })
      .sort((a, b) => b.costPerKm - a.costPerKm);
  },
  summary: (rows) => {
    const distance = rows.reduce((s, r) => s + r.distanceKm, 0);
    const cost = rows.reduce((s, r) => s + r.totalCost, 0);
    return [
      { label: "Vehicles", value: String(rows.length) },
      { label: "Distance", value: `${distance.toLocaleString()} km` },
      { label: "Total cost", value: cost.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
      {
        label: "Fleet cost per km",
        value: distance > 0 ? (Math.round((cost / distance) * 100) / 100).toFixed(2) : "—",
        hint: "weighted, not an average of averages",
      },
    ];
  },
});

// ── Trip profitability ───────────────────────────────────────────────────────

interface TripProfitRow {
  tripCode: string;
  orderCode: string;
  client: string;
  corridor: string;
  completedAt: Date | null;
  distanceKm: number;
  revenue: number;
  directCost: number;
  margin: number;
  marginPct: number;
  revenuePerKm: number;
}

export const tripProfitabilityReport = defineReport<TripProfitRow>({
  key: "trip-profitability",
  title: "Trip & route profitability",
  group: "FINANCE",
  description: "Revenue per load less the direct cost of running it, trip by trip.",
  permission: "report:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
    { name: "corridor", label: "Corridor", kind: "corridor" },
  ],
  columns: [
    { header: "Trip", value: (r) => r.tripCode, width: 14 },
    { header: "Order", value: (r) => r.orderCode, width: 14 },
    { header: "Client", value: (r) => r.client, width: 22 },
    { header: "Corridor", value: (r) => r.corridor, width: 12 },
    { header: "Completed", value: (r) => r.completedAt, width: 12 },
    { header: "Distance (km)", value: (r) => r.distanceKm, width: 13 },
    { header: "Revenue", value: (r) => r.revenue, width: 12 },
    { header: "Direct cost", value: (r) => r.directCost, width: 12 },
    { header: "Margin", value: (r) => r.margin, width: 12 },
    { header: "Margin %", value: (r) => r.marginPct, width: 10 },
    { header: "Revenue per km", value: (r) => r.revenuePerKm, width: 13 },
  ],
  run: async (ctx) => {
    const corridor = ctx.params.corridor;
    const trips = await prisma.trip.findMany({
      where: {
        ...tripWindow(ctx),
        ...(corridor ? { corridor: corridor as never } : {}),
      },
      include: {
        order: { select: { orderCode: true, freightAmount: true, accessorialCharges: true, client: { select: { companyName: true } }, trips: { select: { id: true } } } },
        expenses: { select: { amount: true } },
      },
      orderBy: { actualEnd: "desc" },
    });

    return trips.map((t) => {
      // An order can be moved by several trucks. Splitting its freight evenly
      // across its trips is the honest apportionment without a per-leg rate:
      // charging the whole order to each leg would report the same revenue
      // several times over.
      const legs = Math.max(1, t.order.trips.length);
      const revenue = D(t.order.freightAmount).plus(t.order.accessorialCharges).dividedBy(legs);
      const directCost = t.expenses
        .reduce((s, e) => s.plus(e.amount), D(0))
        .plus(t.driverWages)
        .plus(t.tollPermitCost)
        .plus(t.miscExpense);
      const margin = revenue.minus(directCost);

      return {
        tripCode: t.tripCode,
        orderCode: t.order.orderCode,
        client: t.order.client.companyName,
        corridor: t.corridor,
        completedAt: t.actualEnd,
        distanceKm: D(t.mileageKm).toDecimalPlaces(2).toNumber(),
        revenue: money(revenue),
        directCost: money(directCost),
        margin: money(margin),
        marginPct: revenue.greaterThan(0)
          ? Math.round(margin.dividedBy(revenue).times(1000).toNumber()) / 10
          : 0,
        revenuePerKm: Number(revenuePerKm(revenue, t.mileageKm)),
      };
    });
  },
  summary: (rows) => {
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const cost = rows.reduce((s, r) => s + r.directCost, 0);
    const losing = rows.filter((r) => r.margin < 0).length;
    return [
      { label: "Trips", value: String(rows.length) },
      { label: "Revenue", value: revenue.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
      {
        label: "Margin",
        value: (revenue - cost).toLocaleString(undefined, { maximumFractionDigits: 0 }),
        hint: revenue > 0 ? `${Math.round(((revenue - cost) / revenue) * 1000) / 10}%` : undefined,
      },
      { label: "Loss-making trips", value: String(losing), hint: losing > 0 ? "worth a look" : undefined },
    ];
  },
});

// ── Receivables ageing ───────────────────────────────────────────────────────

interface AgingRow {
  invoiceNumber: string;
  customer: string;
  invoiceDate: Date;
  dueDate: Date | null;
  currency: string;
  total: number;
  paid: number;
  outstanding: number;
  daysOverdue: number;
  bucket: string;
}

/** The ageing bands finance actually chases in. */
function agingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return "Not yet due";
  if (daysOverdue <= 30) return "1-30 days";
  if (daysOverdue <= 60) return "31-60 days";
  if (daysOverdue <= 90) return "61-90 days";
  return "Over 90 days";
}

export const arAgingReport = defineReport<AgingRow>({
  key: "ar-aging",
  title: "Customer billing & AR ageing",
  group: "FINANCE",
  description: "Outstanding freight invoices by how long they have been overdue.",
  permission: "receivable:read",
  params: [{ name: "asOf", label: "As at", kind: "date" }],
  columns: [
    { header: "Invoice", value: (r) => r.invoiceNumber, width: 16 },
    { header: "Customer", value: (r) => r.customer, width: 24 },
    { header: "Invoice date", value: (r) => r.invoiceDate, width: 12 },
    { header: "Due", value: (r) => r.dueDate, width: 12 },
    { header: "Currency", value: (r) => r.currency, width: 9 },
    { header: "Total", value: (r) => r.total, width: 12 },
    { header: "Paid", value: (r) => r.paid, width: 12 },
    { header: "Outstanding", value: (r) => r.outstanding, width: 13 },
    { header: "Days overdue", value: (r) => r.daysOverdue, width: 12 },
    { header: "Bucket", value: (r) => r.bucket, width: 14 },
  ],
  run: async (ctx) => {
    const asOf = ctx.params.asOf ? new Date(`${ctx.params.asOf}T23:59:59.999Z`) : new Date();
    const invoices = await prisma.customerInvoice.findMany({
      where: {
        dataAreaId: ctx.dataAreaId,
        // Drafts have not been issued, and a written-off invoice is not a debt.
        status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
        invoiceDate: { lte: asOf },
      },
      include: { customer: { select: { name: true } } },
      orderBy: { invoiceDate: "asc" },
    });

    return invoices
      .map((i) => {
        const outstanding = D(i.total).minus(i.paidAmount).minus(i.writeOffAmount);
        const days = i.dueDate
          ? Math.floor((asOf.getTime() - i.dueDate.getTime()) / 86_400_000)
          : 0;
        return {
          invoiceNumber: i.invoiceNumber,
          customer: i.customer.name,
          invoiceDate: i.invoiceDate,
          dueDate: i.dueDate,
          currency: i.currency,
          total: money(D(i.total)),
          paid: money(D(i.paidAmount)),
          outstanding: money(outstanding),
          daysOverdue: Math.max(0, days),
          bucket: agingBucket(days),
        };
      })
      // A fully settled invoice that is not yet marked paid is not a debt.
      .filter((r) => r.outstanding > 0);
  },
  summary: (rows) => {
    const band = (name: string) =>
      rows.filter((r) => r.bucket === name).reduce((s, r) => s + r.outstanding, 0);
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return [
      { label: "Outstanding", value: fmt(rows.reduce((s, r) => s + r.outstanding, 0)), hint: `${rows.length} invoices` },
      { label: "Not yet due", value: fmt(band("Not yet due")) },
      { label: "1-60 days", value: fmt(band("1-30 days") + band("31-60 days")) },
      { label: "Over 60 days", value: fmt(band("61-90 days") + band("Over 90 days")), hint: "chase these" },
    ];
  },
});

// ── On-time in-full ──────────────────────────────────────────────────────────

interface OtifRow {
  orderCode: string;
  client: string;
  corridor: string;
  eta: Date | null;
  deliveredAt: Date | null;
  onTime: string;
  inFull: string;
  otif: string;
  damageReports: number;
}

export const otifReport = defineReport<OtifRow>({
  key: "otif",
  title: "On-time in-full (OTIF)",
  group: "EXECUTIVE",
  description: "Deliveries that arrived by their ETA and without a cargo incident.",
  permission: "report:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
  ],
  columns: [
    { header: "Order", value: (r) => r.orderCode, width: 14 },
    { header: "Client", value: (r) => r.client, width: 24 },
    { header: "Corridor", value: (r) => r.corridor, width: 12 },
    { header: "ETA", value: (r) => r.eta, width: 12 },
    { header: "Delivered", value: (r) => r.deliveredAt, width: 12 },
    { header: "On time", value: (r) => r.onTime, width: 10 },
    { header: "In full", value: (r) => r.inFull, width: 10 },
    { header: "OTIF", value: (r) => r.otif, width: 8 },
    { header: "Incidents", value: (r) => r.damageReports, width: 10 },
  ],
  run: async (ctx) => {
    const orders = await prisma.order.findMany({
      where: {
        dataAreaId: ctx.dataAreaId,
        status: { in: ["DELIVERED", "INVOICED"] },
        ...(ctx.from || ctx.to
          ? { bookingDate: { ...(ctx.from ? { gte: ctx.from } : {}), ...(ctx.to ? { lte: ctx.to } : {}) } }
          : {}),
      },
      include: {
        client: { select: { companyName: true } },
        trips: { select: { actualEnd: true } },
        damageReports: { select: { id: true } },
      },
      orderBy: { bookingDate: "desc" },
    });

    return orders.map((o) => {
      // The order is delivered when its last truck arrives, not its first.
      const ends = o.trips.map((t) => t.actualEnd).filter((d): d is Date => d !== null);
      const deliveredAt = ends.length > 0 ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
      // Without an ETA there is nothing to be late against; counted as on time
      // rather than silently failing, and visible as "no ETA" in the column.
      const onTime = !o.eta ? "No ETA" : deliveredAt && deliveredAt <= o.eta ? "Yes" : "No";
      const inFull = o.damageReports.length === 0 ? "Yes" : "No";
      return {
        orderCode: o.orderCode,
        client: o.client.companyName,
        corridor: o.corridor,
        eta: o.eta,
        deliveredAt,
        onTime,
        inFull,
        otif: onTime !== "No" && inFull === "Yes" ? "Yes" : "No",
        damageReports: o.damageReports.length,
      };
    });
  },
  summary: (rows) => {
    const onTime = rows.filter((r) => r.onTime === "Yes").length;
    const inFull = rows.filter((r) => r.inFull === "Yes").length;
    const both = rows.filter((r) => r.otif === "Yes").length;
    const noEta = rows.filter((r) => r.onTime === "No ETA").length;
    return [
      { label: "Deliveries", value: String(rows.length) },
      { label: "On time", value: `${pct(onTime, rows.length)}%` },
      { label: "In full", value: `${pct(inFull, rows.length)}%` },
      {
        label: "OTIF",
        // The tested definition: orders with no ETA leave the denominator,
        // because there was no commitment to measure them against.
        value: `${otifPct(rows.map((r) => ({ eta: r.eta, actualDelivery: r.deliveredAt, hasDamage: r.damageReports > 0 })))}%`,
        hint: noEta > 0 ? `${noEta} without an ETA to judge` : undefined,
      },
    ];
  },
});

export const financeReports: unknown[] = [costPerKmReport, tripProfitabilityReport, arAgingReport, otifReport];

// ── Vehicle total cost of ownership ──────────────────────────────────────────

interface TcoRow {
  vehicle: string;
  plate: string;
  acquisitionCost: number | null;
  depreciationToDate: number | null;
  fuel: number;
  maintenance: number;
  tolls: number;
  other: number;
  tco: number;
  revenue: number;
  roiPct: number | null;
  distanceKm: number;
  tcoPerKm: number | null;
}

export const vehicleTcoReport = defineReport<TcoRow>({
  key: "vehicle-tco",
  title: "Vehicle total cost of ownership & ROI",
  group: "FINANCE",
  description: "What each truck has cost to own and run, against what it has earned.",
  permission: "asset:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
  ],
  columns: [
    { header: "Vehicle", value: (r) => r.vehicle, width: 12 },
    { header: "Plate", value: (r) => r.plate, width: 12 },
    { header: "Acquisition cost", value: (r) => r.acquisitionCost, width: 14 },
    { header: "Depreciation to date", value: (r) => r.depreciationToDate, width: 16 },
    { header: "Fuel", value: (r) => r.fuel, width: 11 },
    { header: "Maintenance", value: (r) => r.maintenance, width: 12 },
    { header: "Tolls & permits", value: (r) => r.tolls, width: 13 },
    { header: "Other", value: (r) => r.other, width: 11 },
    { header: "TCO in window", value: (r) => r.tco, width: 13 },
    { header: "Revenue", value: (r) => r.revenue, width: 12 },
    { header: "ROI %", value: (r) => r.roiPct, width: 9 },
    { header: "Distance (km)", value: (r) => r.distanceKm, width: 13 },
    { header: "TCO per km", value: (r) => r.tcoPerKm, width: 11 },
  ],
  run: async (ctx) => {
    const vehicles = await prisma.vehicle.findMany({
      where: { dataAreaId: ctx.dataAreaId },
      include: {
        // The asset register link added in stage 4, which is what makes
        // depreciation attributable to a truck at all.
        fixedAsset: { select: { acquisitionCost: true, accumulatedDepreciation: true } },
        trips: {
          where: tripWindow(ctx),
          include: {
            expenses: { select: { amount: true, type: true } },
            order: { select: { freightAmount: true, accessorialCharges: true, trips: { select: { id: true } } } },
          },
        },
        serviceOrders: {
          where: { ...(ctx.from || ctx.to ? { openedAt: { ...(ctx.from ? { gte: ctx.from } : {}), ...(ctx.to ? { lte: ctx.to } : {}) } } : {}) },
          select: { totalCost: true },
        },
      },
      orderBy: { vehicleNumber: "asc" },
    });

    return vehicles.map((v) => {
      let fuel = D(0), tolls = D(0), other = D(0), revenue = D(0), distance = D(0), tripMaintenance = D(0);
      for (const t of v.trips) {
        for (const e of t.expenses) {
          // Border fees travel with tolls: both are a cost of the route rather
          // than of the truck. Trip-level maintenance joins the workshop total.
          if (e.type === "FUEL") fuel = fuel.plus(e.amount);
          else if (e.type === "TOLLS" || e.type === "BORDER_FEES") tolls = tolls.plus(e.amount);
          else if (e.type === "MAINTENANCE") tripMaintenance = tripMaintenance.plus(e.amount);
          else other = other.plus(e.amount);
        }
        tolls = tolls.plus(t.tollPermitCost);
        other = other.plus(t.driverWages).plus(t.miscExpense);
        distance = distance.plus(t.mileageKm);
        // Same even split across legs as trip profitability, for the same reason.
        const legs = Math.max(1, t.order.trips.length);
        revenue = revenue.plus(D(t.order.freightAmount).plus(t.order.accessorialCharges).dividedBy(legs));
      }
      const maintenance = v.serviceOrders.reduce((s, o) => s.plus(o.totalCost), D(0)).plus(tripMaintenance);
      const tco = vehicleTco({ maintenance, fuel, tolls, other });
      const asset = v.fixedAsset;
      return {
        vehicle: v.vehicleNumber,
        plate: v.plateNumber,
        acquisitionCost: asset ? money(D(asset.acquisitionCost)) : null,
        depreciationToDate: asset ? money(D(asset.accumulatedDepreciation)) : null,
        fuel: money(fuel),
        maintenance: money(maintenance),
        tolls: money(tolls),
        other: money(other),
        tco: money(tco),
        revenue: money(revenue),
        roiPct: tco.greaterThan(0) ? Math.round(revenue.minus(tco).dividedBy(tco).times(1000).toNumber()) / 10 : null,
        distanceKm: distance.toDecimalPlaces(2).toNumber(),
        tcoPerKm: distance.greaterThan(0) ? Number(costPerKm(tco, distance)) : null,
      };
    });
  },
  summary: (rows) => {
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    const tco = rows.reduce((s, r) => s + r.tco, 0);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const unlinked = rows.filter((r) => r.acquisitionCost === null).length;
    return [
      { label: "Fleet TCO in window", value: fmt(tco) },
      { label: "Revenue", value: fmt(revenue) },
      { label: "Fleet ROI", value: tco > 0 ? `${Math.round(((revenue - tco) / tco) * 1000) / 10}%` : "—" },
      { label: "No asset record", value: String(unlinked), hint: unlinked > 0 ? "depreciation unknown for these" : undefined },
    ];
  },
});

financeReports.push(vehicleTcoReport);
