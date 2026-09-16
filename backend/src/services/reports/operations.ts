import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { defineReport } from "@backend/services/report-registry";
import { withDwell, DEFAULT_FREE_HOURS } from "@backend/services/operational-kpi";
import { pct } from "@backend/services/dashboard-kpi";

/**
 * Fleet operations, maintenance, driver and compliance reports.
 *
 * Every one of these is built from data the system already records. The
 * reports that need a telematics feed are registered in telematics.ts as
 * unavailable, so the catalogue is honest about all seven groups rather than
 * quietly listing only the ones that work.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal.Value) => D(v).toDecimalPlaces(2).toNumber();
const DAY = 86_400_000;

/** Days from `asOf` to a date. Negative means already past. */
function daysUntil(date: Date | null, asOf: Date): number | null {
  if (!date) return null;
  return Math.floor((date.getTime() - asOf.getTime()) / DAY);
}

/** Expiry bands a compliance officer works in. */
function expiryStatus(days: number | null): string {
  if (days === null) return "Not recorded";
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "Due within 30 days";
  if (days <= 90) return "Due within 90 days";
  return "Current";
}

function dateWindow(field: string, from: Date | null, to: Date | null) {
  return from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
}

// ── 1. Fleet operations & dispatch ───────────────────────────────────────────

interface ManifestRow {
  tripCode: string;
  status: string;
  driver: string;
  vehicle: string;
  origin: string;
  destination: string;
  plannedStart: Date;
  actualStart: Date | null;
  plannedEnd: Date;
  actualEnd: Date | null;
  departureDelayHours: number | null;
  arrivalDelayHours: number | null;
  cargo: string;
  cargoKg: number | null;
  pod: string;
}

const hoursBetween = (a: Date | null, b: Date | null) =>
  a && b ? Math.round(((b.getTime() - a.getTime()) / 3_600_000) * 10) / 10 : null;

export const tripManifestReport = defineReport<ManifestRow>({
  key: "trip-manifest",
  title: "Trip sheet & manifest summary",
  group: "FLEET",
  description: "Every trip in the window: who, what, where, and planned against actual times.",
  permission: "trip:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
    { name: "corridor", label: "Corridor", kind: "corridor" },
  ],
  columns: [
    { header: "Trip", value: (r) => r.tripCode, width: 14 },
    { header: "Status", value: (r) => r.status, width: 12 },
    { header: "Driver", value: (r) => r.driver, width: 18 },
    { header: "Vehicle", value: (r) => r.vehicle, width: 12 },
    { header: "Origin", value: (r) => r.origin, width: 18 },
    { header: "Destination", value: (r) => r.destination, width: 18 },
    { header: "Planned start", value: (r) => r.plannedStart, width: 14 },
    { header: "Actual start", value: (r) => r.actualStart, width: 14 },
    { header: "Departure delay (h)", value: (r) => r.departureDelayHours, width: 14 },
    { header: "Planned end", value: (r) => r.plannedEnd, width: 14 },
    { header: "Actual end", value: (r) => r.actualEnd, width: 14 },
    { header: "Arrival delay (h)", value: (r) => r.arrivalDelayHours, width: 14 },
    { header: "Cargo", value: (r) => r.cargo, width: 22 },
    { header: "Cargo (kg)", value: (r) => r.cargoKg, width: 11 },
    { header: "POD", value: (r) => r.pod, width: 8 },
  ],
  run: async (ctx) => {
    const trips = await prisma.trip.findMany({
      where: {
        dataAreaId: ctx.dataAreaId,
        ...dateWindow("scheduledStart", ctx.from, ctx.to),
        ...(ctx.params.corridor ? { corridor: ctx.params.corridor as never } : {}),
      },
      include: {
        driver: { select: { name: true } },
        vehicle: { select: { vehicleNumber: true } },
        order: { select: { originZone: true, destinationZone: true, cargoDescription: true } },
      },
      orderBy: { scheduledStart: "asc" },
    });
    return trips.map((t) => ({
      tripCode: t.tripCode,
      status: t.status,
      driver: t.driver.name,
      vehicle: t.vehicle.vehicleNumber,
      origin: t.originFacility ?? t.order.originZone,
      destination: t.destinationFacility ?? t.order.destinationZone,
      plannedStart: t.scheduledStart,
      actualStart: t.actualStart,
      plannedEnd: t.scheduledEnd,
      actualEnd: t.actualEnd,
      departureDelayHours: hoursBetween(t.scheduledStart, t.actualStart),
      arrivalDelayHours: hoursBetween(t.scheduledEnd, t.actualEnd),
      cargo: t.order.cargoDescription,
      cargoKg: t.cargoWeightKg === null ? null : money(t.cargoWeightKg),
      pod: t.podStatus ? "Yes" : "No",
    }));
  },
  summary: (rows) => {
    const done = rows.filter((r) => r.status === "COMPLETED");
    const late = done.filter((r) => (r.arrivalDelayHours ?? 0) > 0).length;
    const withPod = done.filter((r) => r.pod === "Yes").length;
    return [
      { label: "Trips", value: String(rows.length) },
      { label: "Completed", value: String(done.length) },
      { label: "Arrived late", value: `${pct(late, done.length)}%`, hint: `${late} of ${done.length}` },
      { label: "POD on file", value: `${pct(withPod, done.length)}%`, hint: withPod < done.length ? `${done.length - withPod} missing` : undefined },
    ];
  },
});

interface TurnaroundRow {
  facility: string;
  visits: number;
  avgDwellHours: number | null;
  detainedVisits: number;
  detentionHours: number;
  stillInside: number;
}

export const podTurnaroundReport = defineReport<TurnaroundRow>({
  key: "pod-turnaround",
  title: "Proof of delivery & turnaround time",
  group: "FLEET",
  description: "Dwell and detention at each facility, from paired arrival and departure events.",
  permission: "kpi:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
  ],
  columns: [
    { header: "Facility", value: (r) => r.facility, width: 24 },
    { header: "Visits", value: (r) => r.visits, width: 9 },
    { header: "Avg dwell (h)", value: (r) => r.avgDwellHours, width: 12 },
    { header: "Detained visits", value: (r) => r.detainedVisits, width: 13 },
    { header: "Detention (h)", value: (r) => r.detentionHours, width: 12 },
    { header: "Still inside", value: (r) => r.stillInside, width: 11 },
  ],
  run: async (ctx) => {
    const events = await prisma.dockEvent.findMany({
      where: { dataAreaId: ctx.dataAreaId, ...dateWindow("eventAt", ctx.from, ctx.to) },
      select: { id: true, vehicleId: true, kind: true, eventAt: true, facility: true },
    });
    const paired = withDwell(events);
    const byFacility = new Map<string, TurnaroundRow & { _dwell: number[] }>();
    for (const e of paired) {
      if (e.kind !== "ARRIVAL") continue;
      const key = e.facility ?? "(no facility recorded)";
      const row = byFacility.get(key) ?? { facility: key, visits: 0, avgDwellHours: null, detainedVisits: 0, detentionHours: 0, stillInside: 0, _dwell: [] };
      if (e.dwellHours === null) {
        row.stillInside += 1;
      } else {
        row.visits += 1;
        row._dwell.push(e.dwellHours);
        if ((e.detentionHours ?? 0) > 0) {
          row.detainedVisits += 1;
          row.detentionHours = Math.round((row.detentionHours + (e.detentionHours ?? 0)) * 10) / 10;
        }
      }
      byFacility.set(key, row);
    }
    return [...byFacility.values()]
      .map(({ _dwell, ...r }) => ({
        ...r,
        avgDwellHours: _dwell.length ? Math.round((_dwell.reduce((a, b) => a + b, 0) / _dwell.length) * 10) / 10 : null,
      }))
      .sort((a, b) => b.detentionHours - a.detentionHours);
  },
  summary: (rows) => {
    const visits = rows.reduce((s, r) => s + r.visits, 0);
    const detained = rows.reduce((s, r) => s + r.detainedVisits, 0);
    return [
      { label: "Facilities", value: String(rows.length) },
      { label: "Completed visits", value: String(visits) },
      { label: "Detained", value: `${pct(detained, visits)}%`, hint: `past ${DEFAULT_FREE_HOURS}h free period` },
      { label: "Detention hours", value: String(rows.reduce((s, r) => s + r.detentionHours, 0).toFixed(1)), hint: "billable to customers" },
    ];
  },
});

// ── 3. Maintenance & workshop ────────────────────────────────────────────────

interface WorkOrderRow {
  orderNumber: string;
  vehicle: string;
  kind: string;
  status: string;
  fault: string;
  vendor: string;
  opened: Date;
  completed: Date | null;
  daysOpen: number;
  parts: number;
  labour: number;
  total: number;
}

export const workOrderCostingReport = defineReport<WorkOrderRow>({
  key: "work-order-costing",
  title: "Work order & job card costing",
  group: "MAINTENANCE",
  description: "Parts, labour and total per workshop job, with how long each stayed open.",
  permission: "service:read",
  params: [
    { name: "from", label: "Opened from", kind: "date", required: true },
    { name: "to", label: "Opened to", kind: "date", required: true },
  ],
  columns: [
    { header: "Job", value: (r) => r.orderNumber, width: 14 },
    { header: "Vehicle", value: (r) => r.vehicle, width: 12 },
    { header: "Type", value: (r) => r.kind, width: 10 },
    { header: "Status", value: (r) => r.status, width: 12 },
    { header: "Fault", value: (r) => r.fault, width: 28 },
    { header: "Workshop", value: (r) => r.vendor, width: 20 },
    { header: "Opened", value: (r) => r.opened, width: 12 },
    { header: "Completed", value: (r) => r.completed, width: 12 },
    { header: "Days open", value: (r) => r.daysOpen, width: 10 },
    { header: "Parts", value: (r) => r.parts, width: 11 },
    { header: "Labour", value: (r) => r.labour, width: 11 },
    { header: "Total", value: (r) => r.total, width: 11 },
  ],
  run: async (ctx) => {
    const now = new Date();
    const orders = await prisma.serviceOrder.findMany({
      where: { dataAreaId: ctx.dataAreaId, ...dateWindow("openedAt", ctx.from, ctx.to) },
      include: { vehicle: { select: { vehicleNumber: true } }, vendor: { select: { legalName: true } } },
      orderBy: { openedAt: "desc" },
    });
    return orders.map((o) => ({
      orderNumber: o.orderNumber,
      vehicle: o.vehicle.vehicleNumber,
      kind: o.kind === "INTERNAL" ? "In-house" : "External",
      status: o.status,
      fault: o.fault,
      vendor: o.vendor?.legalName ?? "Own workshop",
      opened: o.openedAt,
      completed: o.completedAt,
      // An open job counts to today, so a stuck one is visible, not hidden.
      daysOpen: Math.max(0, Math.floor(((o.completedAt ?? now).getTime() - o.openedAt.getTime()) / DAY)),
      parts: money(o.partsCost),
      labour: money(o.laborCost),
      total: money(o.totalCost),
    }));
  },
  summary: (rows) => {
    const closed = rows.filter((r) => r.completed);
    const mttr = closed.length ? Math.round((closed.reduce((s, r) => s + r.daysOpen, 0) / closed.length) * 10) / 10 : null;
    return [
      { label: "Jobs", value: String(rows.length), hint: `${rows.length - closed.length} still open` },
      { label: "Parts", value: rows.reduce((s, r) => s + r.parts, 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) },
      { label: "Labour", value: rows.reduce((s, r) => s + r.labour, 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) },
      { label: "Mean time to repair", value: mttr === null ? "—" : `${mttr} days`, hint: "closed jobs only" },
    ];
  },
});

interface ReorderRow {
  sku: string;
  name: string;
  warehouse: string;
  onHand: number;
  reorderPoint: number | null;
  status: string;
}

export const spareStockReorderReport = defineReport<ReorderRow>({
  key: "spare-parts-reorder",
  title: "Spare parts stock & reorder",
  group: "MAINTENANCE",
  description: "Stock on hand against reorder points, flagging what is about to run out.",
  permission: "inventory:read",
  params: [],
  columns: [
    { header: "SKU", value: (r) => r.sku, width: 14 },
    { header: "Item", value: (r) => r.name, width: 28 },
    { header: "Warehouse", value: (r) => r.warehouse, width: 18 },
    { header: "On hand", value: (r) => r.onHand, width: 10 },
    { header: "Reorder point", value: (r) => r.reorderPoint, width: 12 },
    { header: "Status", value: (r) => r.status, width: 14 },
  ],
  run: async (ctx) => {
    const balances = await prisma.stockBalance.findMany({
      // Balances carry no tenant column of their own; the item does.
      where: { stockItem: { dataAreaId: ctx.dataAreaId } },
      include: {
        stockItem: { select: { code: true, name: true, reorderLevel: true } },
        warehouse: { select: { name: true } },
      },
    });
    return balances
      .map((b) => {
        const onHand = D(b.quantity).toNumber();
        // A zero reorder level means none was set: nothing can be flagged against it.
        const point = D(b.stockItem.reorderLevel).greaterThan(0) ? D(b.stockItem.reorderLevel).toNumber() : null;
        return {
          sku: b.stockItem.code,
          name: b.stockItem.name,
          warehouse: b.warehouse.name,
          onHand,
          reorderPoint: point,
          status: onHand <= 0 ? "OUT OF STOCK" : point !== null && onHand <= point ? "Reorder" : "OK",
        };
      })
      .sort((a, b) => (a.status === b.status ? a.sku.localeCompare(b.sku) : a.status === "OUT OF STOCK" ? -1 : b.status === "OUT OF STOCK" ? 1 : a.status === "Reorder" ? -1 : 1));
  },
  summary: (rows) => [
    { label: "Lines", value: String(rows.length) },
    { label: "Out of stock", value: String(rows.filter((r) => r.status === "OUT OF STOCK").length) },
    { label: "Below reorder point", value: String(rows.filter((r) => r.status === "Reorder").length) },
    { label: "No reorder point set", value: String(rows.filter((r) => r.reorderPoint === null).length), hint: "cannot be flagged" },
  ],
});

// ── 4. Driver performance, safety & HR ───────────────────────────────────────

interface DriverExpiryRow {
  driver: string;
  status: string;
  licence: string | null;
  licenceExpiry: Date | null;
  licenceDays: number | null;
  licenceStatus: string;
  medicalExpiry: Date | null;
  medicalDays: number | null;
  medicalStatus: string;
  passportExpiry: Date | null;
  passportStatus: string;
}

export const driverExpiryReport = defineReport<DriverExpiryRow>({
  key: "driver-licence-medical-expiry",
  title: "Driver licence & medical expiry",
  group: "DRIVER",
  description: "Which drivers' licences, medicals and passports lapse, and when.",
  permission: "driver:read",
  params: [{ name: "asOf", label: "As at", kind: "date" }],
  columns: [
    { header: "Driver", value: (r) => r.driver, width: 20 },
    { header: "Status", value: (r) => r.status, width: 10 },
    { header: "Licence no.", value: (r) => r.licence, width: 14 },
    { header: "Licence expiry", value: (r) => r.licenceExpiry, width: 13 },
    { header: "Licence days left", value: (r) => r.licenceDays, width: 12 },
    { header: "Licence status", value: (r) => r.licenceStatus, width: 16 },
    { header: "Medical expiry", value: (r) => r.medicalExpiry, width: 13 },
    { header: "Medical days left", value: (r) => r.medicalDays, width: 12 },
    { header: "Medical status", value: (r) => r.medicalStatus, width: 16 },
    { header: "Passport expiry", value: (r) => r.passportExpiry, width: 13 },
    { header: "Passport status", value: (r) => r.passportStatus, width: 16 },
  ],
  run: async (ctx) => {
    const asOf = ctx.params.asOf ? new Date(ctx.params.asOf) : new Date();
    const drivers = await prisma.driver.findMany({
      where: { dataAreaId: ctx.dataAreaId, status: { not: "INACTIVE" } },
      orderBy: { name: "asc" },
    });
    return drivers
      .map((d) => {
        const l = daysUntil(d.licenseExpiry, asOf);
        const m = daysUntil(d.medicalCertExpiry, asOf);
        const p = daysUntil(d.passportExpiry, asOf);
        return {
          driver: d.name,
          status: d.status,
          licence: d.licenseNumber,
          licenceExpiry: d.licenseExpiry,
          licenceDays: l,
          licenceStatus: expiryStatus(l),
          medicalExpiry: d.medicalCertExpiry,
          medicalDays: m,
          medicalStatus: expiryStatus(m),
          passportExpiry: d.passportExpiry,
          passportStatus: expiryStatus(p),
        };
      })
      // Soonest problem first, so the top of the list is the action list.
      .sort((a, b) => Math.min(a.licenceDays ?? 9999, a.medicalDays ?? 9999) - Math.min(b.licenceDays ?? 9999, b.medicalDays ?? 9999));
  },
  summary: (rows) => {
    const expired = rows.filter((r) => r.licenceStatus === "EXPIRED" || r.medicalStatus === "EXPIRED").length;
    const soon = rows.filter((r) => [r.licenceStatus, r.medicalStatus].includes("Due within 30 days")).length;
    const unknown = rows.filter((r) => r.licenceExpiry === null).length;
    return [
      { label: "Active drivers", value: String(rows.length) },
      { label: "Expired", value: String(expired), hint: expired > 0 ? "must not be dispatched" : undefined },
      { label: "Due within 30 days", value: String(soon) },
      { label: "No licence expiry recorded", value: String(unknown), hint: unknown > 0 ? "cannot be checked" : undefined },
    ];
  },
});

interface DriverSettlementRow {
  driver: string;
  claims: number;
  claimed: number;
  perDiem: number;
  fuel: number;
  tolls: number;
  other: number;
  advancesRecovered: number;
  netDue: number;
}

export const driverSettlementReport = defineReport<DriverSettlementRow>({
  key: "driver-expense-settlement",
  title: "Driver trip allowance & expense settlement",
  group: "DRIVER",
  description: "What each driver claimed, by cost type, and what is due after advances.",
  permission: "expense:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
  ],
  columns: [
    { header: "Driver", value: (r) => r.driver, width: 20 },
    { header: "Claims", value: (r) => r.claims, width: 8 },
    { header: "Claimed", value: (r) => r.claimed, width: 12 },
    { header: "Per-diem", value: (r) => r.perDiem, width: 12 },
    { header: "Fuel", value: (r) => r.fuel, width: 12 },
    { header: "Tolls & permits", value: (r) => r.tolls, width: 13 },
    { header: "Other", value: (r) => r.other, width: 12 },
    { header: "Advances recovered", value: (r) => r.advancesRecovered, width: 15 },
    { header: "Net due", value: (r) => r.netDue, width: 12 },
  ],
  run: async (ctx) => {
    const claims = await prisma.expenseClaim.findMany({
      where: {
        dataAreaId: ctx.dataAreaId,
        driverId: { not: null },
        status: { in: ["SUBMITTED", "APPROVED", "POSTED"] },
        ...dateWindow("createdAt", ctx.from, ctx.to),
      },
      include: { driver: { select: { name: true } }, lines: true },
    });
    const byDriver = new Map<string, DriverSettlementRow>();
    for (const c of claims) {
      const name = c.driver?.name ?? "(unknown)";
      const row = byDriver.get(name) ?? { driver: name, claims: 0, claimed: 0, perDiem: 0, fuel: 0, tolls: 0, other: 0, advancesRecovered: 0, netDue: 0 };
      row.claims += 1;
      for (const l of c.lines) {
        const amt = money(l.amount);
        row.claimed = money(D(row.claimed).plus(amt));
        if (l.kind === "PER_DIEM") row.perDiem = money(D(row.perDiem).plus(amt));
        else if (l.kind === "FUEL") row.fuel = money(D(row.fuel).plus(amt));
        else if (l.kind === "TOLL_PERMIT") row.tolls = money(D(row.tolls).plus(amt));
        else row.other = money(D(row.other).plus(amt));
        if (l.advanceDeducted) row.advancesRecovered = money(D(row.advancesRecovered).plus(l.advanceDeducted));
      }
      row.netDue = money(D(row.claimed).minus(row.advancesRecovered));
      byDriver.set(name, row);
    }
    return [...byDriver.values()].sort((a, b) => b.netDue - a.netDue);
  },
  summary: (rows) => {
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return [
      { label: "Drivers", value: String(rows.length) },
      { label: "Claimed", value: fmt(rows.reduce((s, r) => s + r.claimed, 0)) },
      { label: "Advances recovered", value: fmt(rows.reduce((s, r) => s + r.advancesRecovered, 0)) },
      { label: "Net due to drivers", value: fmt(rows.reduce((s, r) => s + r.netDue, 0)) },
    ];
  },
});

// ── 6. Compliance, risk & regulatory ─────────────────────────────────────────

interface StatutoryRow {
  vehicle: string;
  plate: string;
  insurance: Date;
  insuranceStatus: string;
  inspection: Date;
  inspectionStatus: string;
  registration: Date | null;
  registrationStatus: string;
  comesa: Date | null;
  comesaStatus: string;
  yellowCard: Date | null;
  yellowCardStatus: string;
  worstDays: number;
}

export const statutoryExpiryReport = defineReport<StatutoryRow>({
  key: "vehicle-statutory-expiry",
  title: "Vehicle statutory expiry matrix",
  group: "COMPLIANCE",
  description: "Insurance, inspection, registration and cross-border permits per truck, worst first.",
  permission: "vehicle:read",
  params: [{ name: "asOf", label: "As at", kind: "date" }],
  columns: [
    { header: "Vehicle", value: (r) => r.vehicle, width: 12 },
    { header: "Plate", value: (r) => r.plate, width: 12 },
    { header: "Insurance", value: (r) => r.insurance, width: 12 },
    { header: "Insurance status", value: (r) => r.insuranceStatus, width: 16 },
    { header: "Inspection", value: (r) => r.inspection, width: 12 },
    { header: "Inspection status", value: (r) => r.inspectionStatus, width: 16 },
    { header: "Registration", value: (r) => r.registration, width: 12 },
    { header: "Registration status", value: (r) => r.registrationStatus, width: 16 },
    { header: "COMESA permit", value: (r) => r.comesa, width: 12 },
    { header: "COMESA status", value: (r) => r.comesaStatus, width: 16 },
    { header: "Yellow Card", value: (r) => r.yellowCard, width: 12 },
    { header: "Yellow Card status", value: (r) => r.yellowCardStatus, width: 16 },
  ],
  run: async (ctx) => {
    const asOf = ctx.params.asOf ? new Date(ctx.params.asOf) : new Date();
    const vehicles = await prisma.vehicle.findMany({
      where: { dataAreaId: ctx.dataAreaId },
      orderBy: { vehicleNumber: "asc" },
    });
    return vehicles
      .map((v) => {
        const days = [
          daysUntil(v.insuranceExpiry, asOf),
          daysUntil(v.inspectionExpiry, asOf),
          daysUntil(v.registrationExpiry, asOf),
          daysUntil(v.comesaPermitExpiry, asOf),
          daysUntil(v.yellowCardExpiry, asOf),
        ];
        return {
          vehicle: v.vehicleNumber,
          plate: v.plateNumber,
          insurance: v.insuranceExpiry,
          insuranceStatus: expiryStatus(days[0]),
          inspection: v.inspectionExpiry,
          inspectionStatus: expiryStatus(days[1]),
          registration: v.registrationExpiry,
          registrationStatus: expiryStatus(days[2]),
          comesa: v.comesaPermitExpiry,
          comesaStatus: expiryStatus(days[3]),
          yellowCard: v.yellowCardExpiry,
          yellowCardStatus: expiryStatus(days[4]),
          worstDays: Math.min(...days.filter((d): d is number => d !== null), 9999),
        };
      })
      .sort((a, b) => a.worstDays - b.worstDays);
  },
  summary: (rows) => {
    const anyExpired = rows.filter((r) => r.worstDays < 0).length;
    const soon = rows.filter((r) => r.worstDays >= 0 && r.worstDays <= 30).length;
    return [
      { label: "Vehicles", value: String(rows.length) },
      { label: "Something expired", value: String(anyExpired), hint: anyExpired > 0 ? "off the road until renewed" : undefined },
      { label: "Due within 30 days", value: String(soon) },
      { label: "All current", value: String(rows.filter((r) => r.worstDays > 90).length) },
    ];
  },
});

interface ClaimsRegisterRow {
  report: string;
  date: Date;
  client: string;
  vehicle: string;
  driver: string;
  type: string;
  location: string;
  cause: string;
  liableParty: string;
  currency: string;
  cargoValue: number;
  loss: number;
  claimStatus: string;
  claimNumber: string;
  insurer: string;
  recovered: number;
  status: string;
}

export const claimsRegisterReport = defineReport<ClaimsRegisterRow>({
  key: "accident-claims-register",
  title: "Accident & insurance claims register",
  group: "COMPLIANCE",
  description: "Every incident with its loss, liability, claim state and what came back.",
  permission: "kpi:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
  ],
  columns: [
    { header: "Report", value: (r) => r.report, width: 13 },
    { header: "Date", value: (r) => r.date, width: 12 },
    { header: "Client", value: (r) => r.client, width: 20 },
    { header: "Vehicle", value: (r) => r.vehicle, width: 12 },
    { header: "Driver", value: (r) => r.driver, width: 18 },
    { header: "Type", value: (r) => r.type, width: 18 },
    { header: "Location", value: (r) => r.location, width: 18 },
    { header: "Root cause", value: (r) => r.cause, width: 18 },
    { header: "Liable party", value: (r) => r.liableParty, width: 16 },
    { header: "Currency", value: (r) => r.currency, width: 9 },
    { header: "Cargo value", value: (r) => r.cargoValue, width: 12 },
    { header: "Loss", value: (r) => r.loss, width: 12 },
    { header: "Claim", value: (r) => r.claimStatus, width: 16 },
    { header: "Claim no.", value: (r) => r.claimNumber, width: 14 },
    { header: "Insurer", value: (r) => r.insurer, width: 16 },
    { header: "Recovered", value: (r) => r.recovered, width: 12 },
    { header: "Status", value: (r) => r.status, width: 14 },
  ],
  run: async (ctx) => {
    const reports = await prisma.damageReport.findMany({
      where: { dataAreaId: ctx.dataAreaId, ...dateWindow("reportedAt", ctx.from, ctx.to) },
      include: {
        client: { select: { companyName: true } },
        vehicle: { select: { vehicleNumber: true } },
        driver: { select: { name: true } },
      },
      orderBy: { reportedAt: "desc" },
    });
    return reports.map((r) => ({
      report: r.reportNumber,
      date: r.reportedAt,
      client: r.client?.companyName ?? "",
      vehicle: r.vehicle?.vehicleNumber ?? "",
      driver: r.driver?.name ?? "",
      type: r.incidentType,
      location: r.location ?? "",
      cause: r.rootCause,
      liableParty: r.liableParty ?? "",
      currency: r.currency,
      cargoValue: money(r.cargoValue),
      loss: money(r.damageValue),
      claimStatus: r.claimStatus,
      claimNumber: r.claimNumber ?? "",
      insurer: r.insurerName ?? "",
      recovered: money(r.settlementAmount),
      status: r.status,
    }));
  },
  summary: (rows) => {
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    const loss = rows.reduce((s, r) => s + r.loss, 0);
    const recovered = rows.reduce((s, r) => s + r.recovered, 0);
    return [
      { label: "Incidents", value: String(rows.length) },
      { label: "Total loss", value: fmt(loss), hint: "mixed currencies not converted" },
      { label: "Recovered", value: fmt(recovered), hint: loss > 0 ? `${Math.round((recovered / loss) * 1000) / 10}%` : undefined },
      { label: "Claims not yet filed", value: String(rows.filter((r) => r.claimStatus === "NOT_FILED" && r.loss > 0).length) },
    ];
  },
});

// ── 7. Executive ─────────────────────────────────────────────────────────────

interface AvailabilityRow {
  vehicle: string;
  plate: string;
  equipmentType: string;
  status: string;
  available: string;
  tripsInWindow: number;
  hoursOnTrip: number;
  utilisationPct: number;
}

export const fleetAvailabilityReport = defineReport<AvailabilityRow>({
  key: "fleet-availability-utilisation",
  title: "Fleet availability vs utilisation",
  group: "EXECUTIVE",
  description: "Which trucks are road-ready, and how much of the window each actually spent on a trip.",
  permission: "vehicle:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
  ],
  columns: [
    { header: "Vehicle", value: (r) => r.vehicle, width: 12 },
    { header: "Plate", value: (r) => r.plate, width: 12 },
    { header: "Equipment", value: (r) => r.equipmentType, width: 14 },
    { header: "Status", value: (r) => r.status, width: 13 },
    { header: "Road-ready", value: (r) => r.available, width: 10 },
    { header: "Trips", value: (r) => r.tripsInWindow, width: 8 },
    { header: "Hours on trip", value: (r) => r.hoursOnTrip, width: 12 },
    { header: "Utilisation %", value: (r) => r.utilisationPct, width: 12 },
  ],
  run: async (ctx) => {
    const from = ctx.from ?? new Date(0);
    const to = ctx.to ?? new Date();
    const windowHours = Math.max(1, (to.getTime() - from.getTime()) / 3_600_000);
    const vehicles = await prisma.vehicle.findMany({
      where: { dataAreaId: ctx.dataAreaId },
      include: {
        trips: {
          where: { status: "COMPLETED", actualStart: { not: null }, actualEnd: { not: null, gte: from }, ...(ctx.to ? { actualStart: { lte: to } } : {}) },
          select: { actualStart: true, actualEnd: true },
        },
      },
      orderBy: { vehicleNumber: "asc" },
    });
    return vehicles.map((v) => {
      // Only the part of each trip that falls inside the window counts, or a
      // long trip straddling the edge would report more than 100%.
      const hours = v.trips.reduce((s, t) => {
        const start = Math.max(t.actualStart!.getTime(), from.getTime());
        const end = Math.min(t.actualEnd!.getTime(), to.getTime());
        return s + Math.max(0, end - start) / 3_600_000;
      }, 0);
      return {
        vehicle: v.vehicleNumber,
        plate: v.plateNumber,
        equipmentType: v.equipmentType ?? "",
        status: v.status,
        available: v.status === "AVAILABLE" ? "Yes" : "No",
        tripsInWindow: v.trips.length,
        hoursOnTrip: Math.round(hours * 10) / 10,
        utilisationPct: Math.round((hours / windowHours) * 1000) / 10,
      };
    });
  },
  summary: (rows) => {
    const ready = rows.filter((r) => r.available === "Yes").length;
    const avgUtil = rows.length ? Math.round((rows.reduce((s, r) => s + r.utilisationPct, 0) / rows.length) * 10) / 10 : 0;
    return [
      { label: "Fleet", value: String(rows.length) },
      { label: "Road-ready", value: `${pct(ready, rows.length)}%`, hint: `${ready} of ${rows.length}` },
      { label: "Average utilisation", value: `${avgUtil}%`, hint: "hours on trip over the window" },
      { label: "Idle and ready", value: String(rows.filter((r) => r.available === "Yes" && r.tripsInWindow === 0).length), hint: "capacity going unused" },
    ];
  },
});

export const operationsReports = [
  tripManifestReport, podTurnaroundReport, workOrderCostingReport, spareStockReorderReport,
  driverExpiryReport, driverSettlementReport, statutoryExpiryReport, claimsRegisterReport,
  fleetAvailabilityReport,
];
