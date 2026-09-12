import { Hono } from "hono";
import { Prisma, CorridorType, ForecastStatus, ForecastScenario } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  forecastSchema, forecastUpdateSchema, forecastStatusSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  createForecast, updateForecast, setForecastStatus, computeCapacityPlan,
  computePlanVsActual, computeFleetPlan, type FleetLine,
} from "@backend/services/planning";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";
import { exportIfRequested } from "@backend/lib/export-http";
import type { ExportSpec } from "@backend/services/export";

export const planning = new Hono();

// ── Demand forecasts ─────────────────────────────────────────────────────────

planning.get("/forecasts", requireAuth, requirePermission("planning:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;
  const corridor = sp.corridor;
  const where: Prisma.DemandForecastWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ period: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && status in ForecastStatus ? { status: status as ForecastStatus } : {}),
    ...(corridor && corridor in CorridorType ? { corridor: corridor as CorridorType } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.demandForecast.findMany({
      where,
      orderBy: [{ period: "desc" }, { corridor: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.demandForecast.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

planning.post("/forecasts", requireAuth, requirePermission("planning:write"), async (c) => {
  const user = c.get("user");
  const body = forecastSchema.parse(await c.req.json());
  const forecast = await createForecast({
    dataAreaId: areaForWrite(user, undefined),
    period: body.period,
    corridor: body.corridor,
    forecastLoads: body.forecastLoads,
    forecastTonnes: body.forecastTonnes,
    plannedTrucks: body.plannedTrucks ?? null,
    plannedDrivers: body.plannedDrivers ?? null,
    notes: body.notes || null,
    clientId: body.clientId || null,
    contractName: body.contractName || null,
    cargoType: body.cargoType || null,
    equipmentClass: body.equipmentClass ?? null,
    scenario: body.scenario,
    originHub: body.originHub || null,
    destinationHub: body.destinationHub || null,
    turnaroundDays: body.turnaroundDays ?? null,
    projectedRevenue: body.projectedRevenue ?? null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `DemandForecast:${forecast.id}` });
  return created(c, forecast);
});

planning.patch("/forecasts/:id", requireAuth, requirePermission("planning:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.demandForecast.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = forecastUpdateSchema.parse(await c.req.json());
  const forecast = await updateForecast(existing.dataAreaId, id, body, user.id);
  await logActivity({ userId: user.id, action: "UPDATE", target: `DemandForecast:${id}` });
  return ok(c, forecast);
});

planning.post("/forecasts/:id/status", requireAuth, requirePermission("planning:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.demandForecast.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = forecastStatusSchema.parse(await c.req.json());
  const forecast = await setForecastStatus(existing.dataAreaId, id, body.status, user.id);
  await logActivity({ userId: user.id, action: "SET_STATUS", target: `DemandForecast:${id}`, detail: { status: body.status } });
  return ok(c, forecast);
});

// ── Capacity plan (computed: confirmed demand vs live fleet availability) ─────

planning.get("/capacity", requireAuth, requirePermission("planning:read"), async (c) => {
  const user = c.get("user");
  const period = c.req.query("period");
  if (!period) return c.json({ error: "A period query parameter is required" }, 422);
  const dataAreaId = areaForWrite(user, undefined);
  const plan = await computeCapacityPlan(dataAreaId, period);
  // Serialize Decimals (forecastTonnes) to strings.
  const out = {
    ...plan,
    lines: plan.lines.map((l) => ({ ...l, forecastTonnes: l.forecastTonnes.toFixed(2) })),
  };
  return ok(c, out);
});

/** Columns for the capacity plan export, in the order the screen shows them. */
const FLEET_PLAN_EXPORT = {
  title: "Capacity Plan",
  columns: [
    { header: "Corridor", value: (l: FleetLine) => l.corridor, width: 12 },
    { header: "Equipment", value: (l: FleetLine) => l.equipmentClass ?? "Any", width: 15 },
    { header: "Forecast loads", value: (l: FleetLine) => l.forecastLoads, width: 13 },
    { header: "Forecast tonnes", value: (l: FleetLine) => l.forecastTonnes.toNumber(), width: 14 },
    { header: "Turnaround (days)", value: (l: FleetLine) => l.turnaroundDays, width: 15 },
    { header: "Required fleet", value: (l: FleetLine) => l.requiredFleet, width: 13 },
    { header: "Own fleet", value: (l: FleetLine) => l.ownFleet, width: 11 },
    { header: "In workshop", value: (l: FleetLine) => l.maintenanceFleet, width: 12 },
    { header: "Net capacity", value: (l: FleetLine) => l.netOperationalCapacity, width: 12 },
    { header: "Gap", value: (l: FleetLine) => l.capacityGap, width: 9 },
    { header: "Subcontract needed", value: (l: FleetLine) => l.subcontractRequired, width: 16 },
    { header: "Readiness %", value: (l: FleetLine) => l.readinessPct, width: 11 },
  ],
} satisfies ExportSpec<FleetLine>;

/**
 * Demand against the fleet that can actually serve it.
 *
 * Supersedes /capacity, which counts one truck per load and so ignores how long
 * a corridor takes to turn around. The older route is left in place because the
 * existing screen still calls it.
 */
planning.get("/fleet-plan", requireAuth, requirePermission("planning:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const period = sp.period;
  if (!period) return c.json({ error: "A period query parameter is required" }, 422);

  const plan = await computeFleetPlan(areaForWrite(user, undefined), period, {
    corridor: sp.corridor && sp.corridor in CorridorType ? (sp.corridor as CorridorType) : undefined,
    scenario:
      sp.scenario && sp.scenario in ForecastScenario ? (sp.scenario as ForecastScenario) : undefined,
  });

  const file = await exportIfRequested(c, FLEET_PLAN_EXPORT, async () => plan.lines);
  if (file) return file;

  return ok(c, {
    ...plan,
    lines: plan.lines.map((l) => ({ ...l, forecastTonnes: l.forecastTonnes.toFixed(2) })),
  });
});

// ── Plan vs actual (what was forecast against what actually moved) ───────────

planning.get("/actuals", requireAuth, requirePermission("planning:read"), async (c) => {
  const user = c.get("user");
  const period = c.req.query("period");
  if (!period) return c.json({ error: "A period query parameter is required" }, 422);
  const dataAreaId = areaForWrite(user, undefined);
  const result = await computePlanVsActual(dataAreaId, period);
  // Decimals are serialized as fixed strings so the client never sees an object.
  const out = {
    ...result,
    totalForecastTonnes: result.totalForecastTonnes.toFixed(2),
    totalActualTonnes: result.totalActualTonnes.toFixed(2),
    lines: result.lines.map((l) => ({
      ...l,
      forecastTonnes: l.forecastTonnes.toFixed(2),
      actualTonnes: l.actualTonnes.toFixed(2),
      tonneVariance: l.tonneVariance.toFixed(2),
    })),
  };
  return ok(c, out);
});

/** Distinct periods that have at least one forecast, for the capacity-plan picker. */
planning.get("/periods", requireAuth, requirePermission("planning:read"), async (c) => {
  const user = c.get("user");
  const rows = await prisma.demandForecast.findMany({
    where: { ...areaScope(user) },
    select: { period: true },
    distinct: ["period"],
    orderBy: { period: "desc" },
  });
  return ok(c, rows.map((r) => r.period));
});
