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
