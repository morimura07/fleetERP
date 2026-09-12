import { Prisma, CorridorType, ForecastStatus, EquipmentType, ForecastScenario } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

/**
 * Master Planning (M33). Planners enter a demand forecast per period + corridor
 * (expected loads & tonnage). The capacity plan compares the *confirmed*
 * forecast demand for a period against live fleet/driver availability (or the
 * planner's per-forecast overrides) and surfaces a shortfall or surplus.
 *
 * There is no external forecast feed, so the demand side is planner-entered; the
 * supply side is read live from the vehicle/driver registries. The gap
 * arithmetic is a pure, unit-tested helper.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// ── Pure capacity math (unit-tested) ─────────────────────────────────────────

export interface CapacityLine {
  corridor: CorridorType;
  forecastLoads: number;
  forecastTonnes: Prisma.Decimal;
  capacityLoads: number; // trucks available to serve this corridor's demand
  shortfall: number; // forecastLoads − capacityLoads, floored at 0
  surplus: number; // capacityLoads − forecastLoads, floored at 0
  utilizationPct: number; // forecastLoads / capacityLoads * 100 (0 when no capacity)
}

/**
 * Compute the demand-vs-capacity picture for one corridor line. `capacityLoads`
 * is how many loads the available trucks can serve in the period (1 truck = 1
 * load unless a fleet already models more). Pure — no Prisma.
 */
export function capacityLine(
  corridor: CorridorType,
  forecastLoads: number,
  forecastTonnes: Prisma.Decimal.Value,
  capacityLoads: number,
): CapacityLine {
  const shortfall = Math.max(0, forecastLoads - capacityLoads);
  const surplus = Math.max(0, capacityLoads - forecastLoads);
  const utilizationPct = capacityLoads > 0 ? Math.round((forecastLoads / capacityLoads) * 1000) / 10 : 0;
  return { corridor, forecastLoads, forecastTonnes: D(forecastTonnes), capacityLoads, shortfall, surplus, utilizationPct };
}

// ── Fleet requirement (client requirements, Sept 2026) ───────────────────────

/**
 * Trucks needed to move a forecast within its period.
 *
 * The figure turns on turnaround time, which the old `capacityLine` above
 * ignored by treating one truck as one load. On a Dar es Salaam to Lubumbashi
 * run of twelve days a truck serves about two and a half loads a month, not
 * thirty, so ignoring it understates the fleet needed on long corridors by an
 * order of magnitude and overstates it on short ones.
 *
 *     trucks = loads ÷ (period days ÷ turnaround days)
 *
 * Rounded up: two thirds of a truck cannot move freight.
 */
export function requiredFleet(
  forecastLoads: number,
  turnaroundDays: number | null,
  days: number,
): number {
  if (forecastLoads <= 0 || days <= 0) return 0;
  // Without a turnaround time there is nothing to divide by. Falling back to
  // one truck per load is the old behaviour and is flagged to the caller
  // through `turnaroundKnown`, so the screen can say the figure is a placeholder
  // rather than quietly presenting a guess as a plan.
  if (turnaroundDays === null || turnaroundDays <= 0) return forecastLoads;
  const tripsPerTruck = days / turnaroundDays;
  return Math.ceil(forecastLoads / tripsPerTruck);
}

export interface FleetLine {
  corridor: CorridorType;
  equipmentClass: EquipmentType | null;
  forecastLoads: number;
  forecastTonnes: Prisma.Decimal;
  turnaroundDays: number | null;
  /** False when turnaround time is unset and requiredFleet fell back. */
  turnaroundKnown: boolean;
  /** Trucks needed to serve the forecast within the period. */
  requiredFleet: number;
  /** Company trucks of the right equipment class, whatever their state. */
  ownFleet: number;
  /** Of those, the ones in the workshop or otherwise off the road. */
  maintenanceFleet: number;
  /** Own fleet less the workshop: what can actually be dispatched. */
  netOperationalCapacity: number;
  /** Net capacity less requirement. Negative is a shortfall. */
  capacityGap: number;
  /** Third-party trucks needed to close a deficit. */
  subcontractRequired: number;
  /** Share of dispatchable capacity this forecast would consume. */
  readinessPct: number;
}

export interface FleetInputs {
  corridor: CorridorType;
  equipmentClass: EquipmentType | null;
  forecastLoads: number;
  forecastTonnes: Prisma.Decimal.Value;
  turnaroundDays: number | null;
  ownFleet: number;
  maintenanceFleet: number;
}

/**
 * One corridor's demand against the fleet that can actually serve it. Pure.
 *
 * Readiness is requirement over net capacity rather than over the whole fleet:
 * a yard of thirty trucks with twenty in the workshop is not 50% utilised by a
 * job needing fifteen, it is oversubscribed.
 */
export function fleetLine(input: FleetInputs, days: number): FleetLine {
  const maintenanceFleet = Math.min(input.maintenanceFleet, input.ownFleet);
  const netOperationalCapacity = Math.max(0, input.ownFleet - maintenanceFleet);
  const turnaroundKnown = input.turnaroundDays !== null && input.turnaroundDays > 0;
  const required = requiredFleet(input.forecastLoads, input.turnaroundDays, days);
  const capacityGap = netOperationalCapacity - required;

  return {
    corridor: input.corridor,
    equipmentClass: input.equipmentClass,
    forecastLoads: input.forecastLoads,
    forecastTonnes: D(input.forecastTonnes),
    turnaroundDays: input.turnaroundDays,
    turnaroundKnown,
    requiredFleet: required,
    ownFleet: input.ownFleet,
    maintenanceFleet,
    netOperationalCapacity,
    capacityGap,
    subcontractRequired: Math.max(0, -capacityGap),
    readinessPct:
      netOperationalCapacity > 0 ? Math.round((required / netOperationalCapacity) * 1000) / 10 : 0,
  };
}

export interface FleetPlan {
  period: string;
  days: number;
  lines: FleetLine[];
  totalRequiredFleet: number;
  totalNetCapacity: number;
  totalSubcontractRequired: number;
  overallReadinessPct: number;
  /** Lines whose requirement is a placeholder for want of a turnaround time. */
  linesMissingTurnaround: number;
}

export function summarizeFleetPlan(period: string, days: number, lines: FleetLine[]): FleetPlan {
  const totalRequiredFleet = lines.reduce((s, l) => s + l.requiredFleet, 0);
  // Summed across lines, so a truck counted for two corridors is counted twice.
  // That is the intent: the total answers "how much fleet do these plans want",
  // not "how many distinct trucks exist".
  const totalNetCapacity = lines.reduce((s, l) => s + l.netOperationalCapacity, 0);
  return {
    period,
    days,
    lines,
    totalRequiredFleet,
    totalNetCapacity,
    totalSubcontractRequired: lines.reduce((s, l) => s + l.subcontractRequired, 0),
    overallReadinessPct:
      totalNetCapacity > 0 ? Math.round((totalRequiredFleet / totalNetCapacity) * 1000) / 10 : 0,
    linesMissingTurnaround: lines.filter((l) => !l.turnaroundKnown && l.forecastLoads > 0).length,
  };
}

export interface CapacityPlan {
  period: string;
  lines: CapacityLine[];
  totalForecastLoads: number;
  totalCapacityLoads: number;
  totalShortfall: number;
  overallUtilizationPct: number;
}

/** Aggregate a set of corridor lines for a period into a plan summary. Pure. */
export function summarizePlan(period: string, lines: CapacityLine[]): CapacityPlan {
  const totalForecastLoads = lines.reduce((s, l) => s + l.forecastLoads, 0);
  const totalCapacityLoads = lines.reduce((s, l) => s + l.capacityLoads, 0);
  const totalShortfall = lines.reduce((s, l) => s + l.shortfall, 0);
  const overallUtilizationPct = totalCapacityLoads > 0
    ? Math.round((totalForecastLoads / totalCapacityLoads) * 1000) / 10
    : 0;
  return { period, lines, totalForecastLoads, totalCapacityLoads, totalShortfall, overallUtilizationPct };
}

// ── Plan vs actual (M33, client review: "how do we measure the results?") ────

/**
 * The date window a period label covers, as a half-open range [start, end).
 *
 * Supports the two labels the forecast model documents: "2026-08" (month) and
 * "2026-W32" (ISO week, Monday start, week 1 being the week containing 4 Jan).
 * Returns null for anything else rather than guessing, so a malformed period
 * reports no actuals instead of silently matching the wrong dates.
 */
export function periodRange(period: string): { start: Date; end: Date } | null {
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) {
    const year = Number(month[1]);
    const m = Number(month[2]);
    if (m < 1 || m > 12) return null;
    return { start: new Date(Date.UTC(year, m - 1, 1)), end: new Date(Date.UTC(year, m, 1)) };
  }

  const week = /^(\d{4})-W(\d{1,2})$/.exec(period);
  if (week) {
    const year = Number(week[1]);
    const w = Number(week[2]);
    if (w < 1 || w > 53) return null;
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const mondayOffset = (jan4.getUTCDay() + 6) % 7; // shift so Monday = 0
    const week1Monday = new Date(jan4.getTime() - mondayOffset * 86_400_000);
    const start = new Date(week1Monday.getTime() + (w - 1) * 7 * 86_400_000);
    return { start, end: new Date(start.getTime() + 7 * 86_400_000) };
  }

  // Quarterly and annual horizons (client requirements, Sept 2026): the
  // planning screen toggles between month, quarter and year, and every one of
  // them has to resolve to real dates for the capacity maths to divide by.
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarter) {
    const year = Number(quarter[1]);
    const q = Number(quarter[2]);
    const firstMonth = (q - 1) * 3;
    return {
      start: new Date(Date.UTC(year, firstMonth, 1)),
      end: new Date(Date.UTC(year, firstMonth + 3, 1)),
    };
  }

  const annual = /^(\d{4})$/.exec(period);
  if (annual) {
    const year = Number(annual[1]);
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
  }

  return null;
}

/** Days a period label covers, or null if the label is not one we understand. */
export function periodDays(period: string): number | null {
  const range = periodRange(period);
  if (!range) return null;
  return Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000);
}

export interface PlanActualLine {
  corridor: CorridorType;
  forecastLoads: number;
  actualLoads: number;
  loadVariance: number; // actual − forecast; negative means under-delivered
  loadAchievedPct: number; // actual / forecast × 100
  forecastTonnes: Prisma.Decimal;
  actualTonnes: Prisma.Decimal;
  tonneVariance: Prisma.Decimal;
  tonneAchievedPct: number;
}

/**
 * Forecast against what actually moved on one corridor. Pure — no Prisma.
 *
 * Achieved percentages are 0 when nothing was forecast: dividing by zero would
 * be meaningless, and the variance still carries the signal (a corridor that ran
 * unplanned work shows +N with 0%).
 */
export function planActualLine(
  corridor: CorridorType,
  forecastLoads: number,
  forecastTonnes: Prisma.Decimal.Value,
  actualLoads: number,
  actualTonnes: Prisma.Decimal.Value,
): PlanActualLine {
  const fTonnes = D(forecastTonnes);
  const aTonnes = D(actualTonnes);
  const pct = (actual: Prisma.Decimal, forecast: Prisma.Decimal) =>
    forecast.greaterThan(0) ? Math.round(actual.div(forecast).toNumber() * 1000) / 10 : 0;

  return {
    corridor,
    forecastLoads,
    actualLoads,
    loadVariance: actualLoads - forecastLoads,
    loadAchievedPct: forecastLoads > 0 ? Math.round((actualLoads / forecastLoads) * 1000) / 10 : 0,
    forecastTonnes: fTonnes,
    actualTonnes: aTonnes,
    tonneVariance: aTonnes.minus(fTonnes),
    tonneAchievedPct: pct(aTonnes, fTonnes),
  };
}

export interface PlanVsActual {
  period: string;
  lines: PlanActualLine[];
  totalForecastLoads: number;
  totalActualLoads: number;
  totalForecastTonnes: Prisma.Decimal;
  totalActualTonnes: Prisma.Decimal;
  loadAchievedPct: number;
  tonneAchievedPct: number;
}

/** Roll corridor lines into a period summary. Pure. */
export function summarizePlanVsActual(period: string, lines: PlanActualLine[]): PlanVsActual {
  const zero = D(0);
  const totalForecastLoads = lines.reduce((s, l) => s + l.forecastLoads, 0);
  const totalActualLoads = lines.reduce((s, l) => s + l.actualLoads, 0);
  const totalForecastTonnes = lines.reduce((s, l) => s.plus(l.forecastTonnes), zero);
  const totalActualTonnes = lines.reduce((s, l) => s.plus(l.actualTonnes), zero);

  return {
    period,
    lines,
    totalForecastLoads,
    totalActualLoads,
    totalForecastTonnes,
    totalActualTonnes,
    loadAchievedPct: totalForecastLoads > 0 ? Math.round((totalActualLoads / totalForecastLoads) * 1000) / 10 : 0,
    tonneAchievedPct: totalForecastTonnes.greaterThan(0)
      ? Math.round(totalActualTonnes.div(totalForecastTonnes).toNumber() * 1000) / 10
      : 0,
  };
}

/** Orders that represent real movement: a draft is a quote, a cancellation never ran. */
const ACTUAL_ORDER_STATUSES = ["CONFIRMED", "IN_TRANSIT", "DELIVERED", "INVOICED"] as const;

/**
 * Forecast vs actual for a period, per corridor.
 *
 * Actuals come from orders booked inside the period: one order is one load, and
 * tonnage is their gross weight converted from kilograms. Corridors that carried
 * work without a forecast are included with a zero plan, so unplanned volume is
 * visible rather than dropped.
 */
export async function computePlanVsActual(dataAreaId: string, period: string): Promise<PlanVsActual> {
  const range = periodRange(period);

  const forecasts = await prisma.demandForecast.findMany({
    where: { dataAreaId, period, status: { in: ["CONFIRMED", "ARCHIVED"] } },
    orderBy: { corridor: "asc" },
  });

  const orders = range
    ? await prisma.order.groupBy({
        by: ["corridor"],
        where: {
          dataAreaId,
          status: { in: [...ACTUAL_ORDER_STATUSES] },
          bookingDate: { gte: range.start, lt: range.end },
        },
        _count: { _all: true },
        _sum: { grossWeightKg: true },
      })
    : [];

  const actualByCorridor = new Map(
    orders.map((o) => [
      o.corridor,
      { loads: o._count._all, tonnes: D(o._sum.grossWeightKg ?? 0).div(1000) }, // kg → tonnes
    ]),
  );

  const corridors = new Set<CorridorType>([
    ...forecasts.map((f) => f.corridor),
    ...actualByCorridor.keys(),
  ]);

  const lines = [...corridors]
    .sort()
    .map((corridor) => {
      const f = forecasts.find((x) => x.corridor === corridor);
      const a = actualByCorridor.get(corridor);
      return planActualLine(
        corridor,
        f?.forecastLoads ?? 0,
        f?.forecastTonnes ?? 0,
        a?.loads ?? 0,
        a?.tonnes ?? 0,
      );
    });

  return summarizePlanVsActual(period, lines);
}

// ── Forecast CRUD ────────────────────────────────────────────────────────────

export interface ForecastInput {
  dataAreaId: string;
  period: string;
  corridor: CorridorType;
  forecastLoads?: number;
  forecastTonnes?: Prisma.Decimal.Value;
  plannedTrucks?: number | null;
  plannedDrivers?: number | null;
  notes?: string | null;
  createdById?: string | null;
  // Planning detail (client amendments, Aug 2026).
  clientId?: string | null;
  contractName?: string | null;
  cargoType?: string | null;
  equipmentClass?: EquipmentType | null;
  originHub?: string | null;
  destinationHub?: string | null;
  turnaroundDays?: Prisma.Decimal.Value | null;
  projectedRevenue?: Prisma.Decimal.Value | null;
  scenario?: ForecastScenario;
}

export async function createForecast(input: ForecastInput) {
  const existing = await prisma.demandForecast.findFirst({
    where: { dataAreaId: input.dataAreaId, period: input.period, corridor: input.corridor },
    select: { id: true },
  });
  if (existing) throw new AuthError(`A forecast for ${input.period} / ${input.corridor} already exists`, 409);
  return prisma.demandForecast.create({
    data: {
      dataAreaId: input.dataAreaId,
      period: input.period,
      corridor: input.corridor,
      forecastLoads: input.forecastLoads ?? 0,
      forecastTonnes: D(input.forecastTonnes ?? 0),
      plannedTrucks: input.plannedTrucks ?? null,
      plannedDrivers: input.plannedDrivers ?? null,
      notes: input.notes ?? null,
      clientId: input.clientId ?? null,
      contractName: input.contractName ?? null,
      cargoType: input.cargoType ?? null,
      equipmentClass: input.equipmentClass ?? null,
      scenario: input.scenario ?? "BASE",
      originHub: input.originHub ?? null,
      destinationHub: input.destinationHub ?? null,
      turnaroundDays: input.turnaroundDays != null ? D(input.turnaroundDays) : null,
      projectedRevenue: input.projectedRevenue != null ? D(input.projectedRevenue) : null,
      createdById: input.createdById ?? null,
    },
  });
}

export interface ForecastUpdateInput {
  forecastLoads?: number;
  forecastTonnes?: Prisma.Decimal.Value;
  plannedTrucks?: number | null;
  plannedDrivers?: number | null;
  notes?: string | null;
}

export async function updateForecast(dataAreaId: string, id: string, patch: ForecastUpdateInput, userId?: string | null) {
  const forecast = await prisma.demandForecast.findFirst({ where: { id, dataAreaId }, select: { id: true, status: true } });
  if (!forecast) throw new AuthError("Forecast not found", 404);
  if (forecast.status === "ARCHIVED") throw new AuthError("An archived forecast cannot be edited", 422);
  return prisma.demandForecast.update({
    where: { id: forecast.id },
    data: {
      ...(patch.forecastLoads != null ? { forecastLoads: patch.forecastLoads } : {}),
      ...(patch.forecastTonnes != null ? { forecastTonnes: D(patch.forecastTonnes) } : {}),
      ...(patch.plannedTrucks !== undefined ? { plannedTrucks: patch.plannedTrucks } : {}),
      ...(patch.plannedDrivers !== undefined ? { plannedDrivers: patch.plannedDrivers } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      updatedById: userId ?? null,
    },
  });
}

/** Forecast lifecycle: DRAFT → CONFIRMED → ARCHIVED (both directions between the first two). */
export const FORECAST_TRANSITIONS: Record<ForecastStatus, ForecastStatus[]> = {
  DRAFT: ["CONFIRMED"],
  CONFIRMED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: [],
};

export function canTransition(from: ForecastStatus, to: ForecastStatus): boolean {
  return FORECAST_TRANSITIONS[from].includes(to);
}

export async function setForecastStatus(dataAreaId: string, id: string, status: ForecastStatus, userId?: string | null) {
  const forecast = await prisma.demandForecast.findFirst({ where: { id, dataAreaId }, select: { id: true, status: true } });
  if (!forecast) throw new AuthError("Forecast not found", 404);
  if (!canTransition(forecast.status, status)) {
    throw new AuthError(`Cannot move a ${forecast.status} forecast to ${status}`, 422);
  }
  return prisma.demandForecast.update({ where: { id: forecast.id }, data: { status, updatedById: userId ?? null } });
}

// ── Capacity plan (computed) ─────────────────────────────────────────────────

/**
 * Build the capacity plan for a period: for each confirmed forecast, compare its
 * demand against capacity. Capacity is the forecast's `plannedTrucks` override
 * when set, otherwise the live count of available trucks split evenly across the
 * period's corridors (a simple even allocation of the shared fleet).
 */
export interface FleetPlanOptions {
  corridor?: CorridorType;
  scenario?: ForecastScenario;
}

/**
 * The capacity picture the planning screen shows: demand against the fleet that
 * can actually serve it, corridor by corridor.
 *
 * Own fleet is counted per equipment class, because a tanker cannot take a
 * flatbed load. A forecast that names no class is served by the whole fleet,
 * and a truck with no class set is counted against no class at all: guessing
 * either way would overstate capacity, and overstating capacity is how a
 * planner finds out they are short on the day of loading.
 */
export async function computeFleetPlan(
  dataAreaId: string,
  period: string,
  options: FleetPlanOptions = {},
): Promise<FleetPlan> {
  const days = periodDays(period);
  if (days === null) {
    throw new AuthError(
      `"${period}" is not a period this system understands. Use 2026-08, 2026-Q3, 2026 or 2026-W32.`,
      422,
    );
  }

  const forecasts = await prisma.demandForecast.findMany({
    where: {
      dataAreaId,
      period,
      status: "CONFIRMED",
      ...(options.corridor ? { corridor: options.corridor } : {}),
      // Absent a choice, the base case is the plan of record.
      scenario: options.scenario ?? "BASE",
    },
    orderBy: [{ corridor: "asc" }, { equipmentClass: "asc" }],
  });

  // One grouped query for the whole fleet rather than one per forecast line.
  const fleet = await prisma.vehicle.groupBy({
    by: ["equipmentType", "status"],
    where: { dataAreaId },
    _count: { _all: true },
  });

  const owned = new Map<string, number>();
  const offRoad = new Map<string, number>();
  let ownedTotal = 0;
  let offRoadTotal = 0;
  for (const row of fleet) {
    const key = row.equipmentType ?? "";
    const n = row._count._all;
    // A truck with no class set counts toward the fleet total but toward no
    // particular class, so it never inflates a class it may not belong to.
    if (key) owned.set(key, (owned.get(key) ?? 0) + n);
    ownedTotal += n;
    if (row.status !== "AVAILABLE") {
      if (key) offRoad.set(key, (offRoad.get(key) ?? 0) + n);
      offRoadTotal += n;
    }
  }

  const lines = forecasts.map((f) => {
    const cls = f.equipmentClass;
    return fleetLine(
      {
        corridor: f.corridor,
        equipmentClass: cls,
        forecastLoads: f.forecastLoads,
        forecastTonnes: f.forecastTonnes,
        turnaroundDays: f.turnaroundDays === null ? null : Number(f.turnaroundDays),
        // An explicit plannedTrucks overrides the live count, which is how a
        // planner models a fleet they are about to have rather than the one
        // they have today.
        ownFleet: f.plannedTrucks ?? (cls ? (owned.get(cls) ?? 0) : ownedTotal),
        maintenanceFleet: f.plannedTrucks != null ? 0 : cls ? (offRoad.get(cls) ?? 0) : offRoadTotal,
      },
      days,
    );
  });

  return summarizeFleetPlan(period, days, lines);
}

export async function computeCapacityPlan(dataAreaId: string, period: string): Promise<CapacityPlan> {
  const forecasts = await prisma.demandForecast.findMany({
    where: { dataAreaId, period, status: "CONFIRMED" },
    orderBy: { corridor: "asc" },
  });

  const availableTrucks = await prisma.vehicle.count({ where: { dataAreaId, status: "AVAILABLE" } });
  // Forecasts that rely on the shared live fleet (no override) split it evenly.
  const sharedCount = forecasts.filter((f) => f.plannedTrucks == null).length || 1;
  const sharePerCorridor = Math.floor(availableTrucks / sharedCount);

  const lines = forecasts.map((f) =>
    capacityLine(
      f.corridor,
      f.forecastLoads,
      f.forecastTonnes,
      f.plannedTrucks != null ? f.plannedTrucks : sharePerCorridor,
    ),
  );
  return summarizePlan(period, lines);
}
