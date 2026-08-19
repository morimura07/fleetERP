import { Hono } from "hono";
import { Prisma, CorridorType, ForecastStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  forecastSchema, forecastUpdateSchema, forecastStatusSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  createForecast, updateForecast, setForecastStatus, computeCapacityPlan,
  computePlanVsActual,
} from "@backend/services/planning";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

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
