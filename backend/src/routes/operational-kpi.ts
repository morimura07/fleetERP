import { Hono } from "hono";
import { Prisma, DamageStatus, ClaimStatus, IncidentType, DockEventKind, DockActivity } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  dockEventSchema, damageReportSchema, damageStatusSchema, feedbackSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  recordDockEvent, createDamageReport, setDamageStatus, recordFeedback, withDwell,
} from "@backend/services/operational-kpi";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const operationalKpi = new Hono();

// ── Dock events (truck-turnaround capture) ───────────────────────────────────

operationalKpi.get("/dock-events", requireAuth, requirePermission("kpi:read"), async (c) => {
  const user = c.get("user");
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());
  const kind = c.req.query("kind");
  const activity = c.req.query("activity");
  const where: Prisma.DockEventWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ facility: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }, { trailerNumber: { contains: q, mode: "insensitive" } }] } : {}),
    ...(kind && kind in DockEventKind ? { kind: kind as DockEventKind } : {}),
    ...(activity && activity in DockActivity ? { activity: activity as DockActivity } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.dockEvent.findMany({
      where,
      include: {
        vehicle: { select: { plateNumber: true, model: true, vehicleNumber: true } },
        driver: { select: { name: true } },
        trip: { select: { tripCode: true } },
      },
      orderBy: { eventAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.dockEvent.count({ where }),
  ]);

  // Dwell needs both halves of a visit, and the page may split them. Pair
  // against the full history of the vehicles on this page rather than the page
  // itself, or a truck whose departure fell on page 2 would read as still inside.
  const vehicleIds = [...new Set(items.map((e) => e.vehicleId))];
  const context = await prisma.dockEvent.findMany({
    where: { ...areaScope(user), vehicleId: { in: vehicleIds } },
    select: { id: true, vehicleId: true, kind: true, eventAt: true },
  });
  const dwellById = new Map(withDwell(context).map((e) => [e.id, e]));

  const rows = items.map((e) => ({
    ...e,
    dwellHours: dwellById.get(e.id)?.dwellHours ?? null,
    detentionHours: dwellById.get(e.id)?.detentionHours ?? null,
  }));
  return ok(c, rows, pageMeta(page, pageSize, total));
});

operationalKpi.post("/dock-events", requireAuth, requirePermission("kpi:write"), async (c) => {
  const user = c.get("user");
  const body = dockEventSchema.parse(await c.req.json());
  const event = await recordDockEvent({
    dataAreaId: areaForWrite(user, undefined),
    vehicleId: body.vehicleId,
    tripId: body.tripId || null,
    facility: body.facility || null,
    kind: body.kind,
    eventAt: body.eventAt,
    note: body.note || null,
    driverId: body.driverId || null,
    trailerNumber: body.trailerNumber || null,
    dockBay: body.dockBay || null,
    activity: body.activity,
    sealNumber: body.sealNumber || null,
    sealIntact: body.sealIntact ?? null,
    odometerKm: body.odometerKm ?? null,
    fuelLevel: body.fuelLevel || null,
    source: body.source,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `DockEvent:${event.id}` });
  return created(c, event);
});

// ── Damage reports (damage & claim rate capture) ─────────────────────────────

operationalKpi.get("/damage-reports", requireAuth, requirePermission("kpi:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;
  const where: Prisma.DamageReportWhereInput = {
    ...areaScope(user),
    ...(q ? { OR: [{ reportNumber: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status && status in DamageStatus ? { status: status as DamageStatus } : {}),
    ...(sp.claimStatus && sp.claimStatus in ClaimStatus ? { claimStatus: sp.claimStatus as ClaimStatus } : {}),
    ...(sp.incidentType && sp.incidentType in IncidentType ? { incidentType: sp.incidentType as IncidentType } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.damageReport.findMany({
      where,
      include: {
        order: { select: { orderCode: true } },
        client: { select: { companyName: true } },
        vehicle: { select: { vehicleNumber: true, plateNumber: true } },
        driver: { select: { name: true } },
        trip: { select: { tripCode: true } },
      },
      orderBy: { reportedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.damageReport.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

operationalKpi.post("/damage-reports", requireAuth, requirePermission("kpi:write"), async (c) => {
  const user = c.get("user");
  const body = damageReportSchema.parse(await c.req.json());
  const report = await createDamageReport({
    dataAreaId: areaForWrite(user, undefined),
    orderId: body.orderId || null,
    tripId: body.tripId || null,
    reportedAt: body.reportedAt,
    cargoValue: body.cargoValue,
    damageValue: body.damageValue,
    currency: body.currency,
    description: body.description || null,
    clientId: body.clientId || null,
    vehicleId: body.vehicleId || null,
    driverId: body.driverId || null,
    incidentType: body.incidentType,
    location: body.location || null,
    rootCause: body.rootCause,
    liableParty: body.liableParty || null,
    insurerName: body.insurerName || null,
    claimNumber: body.claimNumber || null,
    claimStatus: body.claimStatus,
    settlementAmount: body.settlementAmount,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `DamageReport:${report.id}` });
  return created(c, report);
});

operationalKpi.post("/damage-reports/:id/status", requireAuth, requirePermission("kpi:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.damageReport.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = damageStatusSchema.parse(await c.req.json());
  const report = await setDamageStatus(existing.dataAreaId, id, body.status, user.id);
  await logActivity({ userId: user.id, action: "SET_STATUS", target: `DamageReport:${id}`, detail: { status: body.status } });
  return ok(c, report);
});

// ── Customer feedback (CSAT / NPS capture) ───────────────────────────────────

operationalKpi.get("/feedback", requireAuth, requirePermission("kpi:read"), async (c) => {
  const user = c.get("user");
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());
  const where: Prisma.CustomerFeedbackWhereInput = {
    ...areaScope(user),
    ...(q ? { comment: { contains: q, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.customerFeedback.findMany({
      where,
      include: { customer: { select: { name: true } }, order: { select: { orderCode: true } } },
      orderBy: { collectedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customerFeedback.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

operationalKpi.post("/feedback", requireAuth, requirePermission("kpi:write"), async (c) => {
  const user = c.get("user");
  const body = feedbackSchema.parse(await c.req.json());
  const feedback = await recordFeedback({
    dataAreaId: areaForWrite(user, undefined),
    customerId: body.customerId,
    orderId: body.orderId || null,
    csat: body.csat ?? null,
    nps: body.nps ?? null,
    comment: body.comment || null,
    collectedAt: body.collectedAt,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `CustomerFeedback:${feedback.id}` });
  return created(c, feedback);
});
