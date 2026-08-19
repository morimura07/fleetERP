import { Prisma, CorridorType, ForecastStatus } from "@prisma/client";
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

  return null;
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
