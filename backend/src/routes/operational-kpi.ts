import { Hono } from "hono";
import { Prisma, DamageStatus, ClaimStatus, IncidentType, DockEventKind, DockActivity, CorridorType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  dockEventSchema, damageReportSchema, damageStatusSchema, feedbackSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  recordDockEvent, createDamageReport, setDamageStatus, recordFeedback, withDwell,
  summarizeDock, summarizeIncidents, shiftWindows, openArrivalIds, damageRatioPct, recoveryPct,
} from "@backend/services/operational-kpi";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";
import { exportIfRequested } from "@backend/lib/export-http";
import type { ExportSpec } from "@backend/services/export";

export const operationalKpi = new Hono();

// ── Dock events (truck-turnaround capture) ───────────────────────────────────

/** A date-only query parameter, read as the whole day it names. */
function dayBound(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Every filter the dock events screen offers, in one place.
 *
 * The list, the KPI ribbon and the CSV export all build their query from this,
 * so a ribbon can never describe a different set of rows than the table beneath
 * it. `view=INSIDE` is the exception and is applied by the caller, because it
 * needs the pairing pass rather than a predicate.
 */
async function dockFilters(
  c: { req: { query: () => Record<string, string> } },
  user: Parameters<typeof areaScope>[0],
): Promise<Prisma.DockEventWhereInput> {
  const sp = c.req.query();
  const q = sp.q;
  const from = dayBound(sp.from);
  const to = dayBound(sp.to, true);
  const facilities = (sp.facility ?? "").split(",").map((f) => f.trim()).filter(Boolean);
  const view = sp.view;
  const shift = sp.shift === "DAY" || sp.shift === "NIGHT" ? sp.shift : undefined;

  // A shift is a band of local hours, which needs one window per day; bound it
  // to the requested range, or to the last 30 days when none was given.
  const shiftRange = shift
    ? shiftWindows(from ?? new Date(Date.now() - 30 * 86_400_000), to ?? new Date(), shift)
    : null;

  // Both the search and the shift filter are disjunctions, and a bare object
  // can only carry one OR. They are combined through AND so that searching
  // while filtering by shift applies both instead of silently dropping one.
  const and: Prisma.DockEventWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { facility: { contains: q, mode: "insensitive" } },
        { note: { contains: q, mode: "insensitive" } },
        { trailerNumber: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (shiftRange) and.push({ OR: shiftRange.map((w) => ({ eventAt: w })) });

  return {
    ...areaScope(user),
    ...(sp.kind && sp.kind in DockEventKind ? { kind: sp.kind as DockEventKind } : {}),
    ...(sp.activity && sp.activity in DockActivity ? { activity: sp.activity as DockActivity } : {}),
    ...(view === "ARRIVALS" ? { kind: DockEventKind.ARRIVAL } : {}),
    ...(view === "DEPARTURES" ? { kind: DockEventKind.DEPARTURE } : {}),
    ...(facilities.length ? { facility: { in: facilities } } : {}),
    ...(from || to ? { eventAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

/** Distinct facilities seen in this tenant, for the filter's multi-select. */
operationalKpi.get("/dock-events/facilities", requireAuth, requirePermission("kpi:read"), async (c) => {
  const user = c.get("user");
  const rows = await prisma.dockEvent.findMany({
    where: { ...areaScope(user), facility: { not: null } },
    select: { facility: true },
    distinct: ["facility"],
    orderBy: { facility: "asc" },
  });
  return ok(c, rows.map((r) => r.facility).filter((f): f is string => Boolean(f)));
});

/** The KPI ribbon above the table. Same filters as the list beneath it. */
operationalKpi.get("/dock-events/summary", requireAuth, requirePermission("kpi:read"), async (c) => {
  const user = c.get("user");
  const where = await dockFilters(c, user);
  // Pairing needs whole visits, so the summary reads the filtered set rather
  // than a page of it. Bounded in practice by the date filter.
  const events = await prisma.dockEvent.findMany({
    where,
    select: { id: true, vehicleId: true, kind: true, eventAt: true },
  });
  return ok(c, summarizeDock(events));
});

/** Columns for a dock events export. Mirrors the table on screen. */
const DOCK_EXPORT = {
  title: "Dock Events",
  columns: [
    { header: "When", value: (r: DockEventExportRow) => r.eventAt, width: 18 },
    { header: "Vehicle", value: (r: DockEventExportRow) => r.vehicle?.vehicleNumber ?? "", width: 14 },
    { header: "Trailer", value: (r: DockEventExportRow) => r.trailerNumber ?? "", width: 14 },
    { header: "Trip", value: (r: DockEventExportRow) => r.trip?.tripCode ?? "", width: 14 },
    { header: "Driver", value: (r: DockEventExportRow) => r.driver?.name ?? "", width: 18 },
    { header: "Event", value: (r: DockEventExportRow) => r.kind, width: 11 },
    { header: "Activity", value: (r: DockEventExportRow) => r.activity, width: 16 },
    { header: "Facility", value: (r: DockEventExportRow) => r.facility ?? "", width: 20 },
    { header: "Bay / Gate", value: (r: DockEventExportRow) => r.dockBay ?? "", width: 12 },
    { header: "Seal", value: (r: DockEventExportRow) => r.sealNumber ?? "", width: 14 },
    { header: "Seal intact", value: (r: DockEventExportRow) => (r.sealIntact === null ? "" : r.sealIntact ? "Yes" : "No"), width: 10 },
    { header: "Odometer (km)", value: (r: DockEventExportRow) => r.odometerKm, width: 12 },
    { header: "Source", value: (r: DockEventExportRow) => r.source, width: 13 },
  ],
} satisfies ExportSpec<DockEventExportRow>;

interface DockEventExportRow {
  eventAt: Date;
  kind: DockEventKind;
  activity: DockActivity;
  facility: string | null;
  trailerNumber: string | null;
  dockBay: string | null;
  sealNumber: string | null;
  sealIntact: boolean | null;
  odometerKm: number | null;
  source: string;
  vehicle: { vehicleNumber: string } | null;
  driver: { name: string } | null;
  trip: { tripCode: string } | null;
}

operationalKpi.get("/dock-events", requireAuth, requirePermission("kpi:read"), async (c) => {
  const user = c.get("user");
  const { page, pageSize } = paginationSchema.parse(c.req.query());
  const base = await dockFilters(c, user);

  // "Currently inside" is a property of the event sequence, not of a row, so it
  // resolves to a set of arrival ids before the page is taken.
  let where = base;
  if (c.req.query("view") === "INSIDE") {
    const all = await prisma.dockEvent.findMany({
      where: { ...areaScope(user) },
      select: { id: true, vehicleId: true, kind: true, eventAt: true },
    });
    where = { ...base, id: { in: openArrivalIds(all) } };
  }

  // Same `where`, so the file holds exactly the rows the screen would show.
  const file = await exportIfRequested(c, DOCK_EXPORT, (take) =>
    prisma.dockEvent.findMany({
      where,
      include: {
        vehicle: { select: { vehicleNumber: true } },
        driver: { select: { name: true } },
        trip: { select: { tripCode: true } },
      },
      orderBy: { eventAt: "desc" },
      take,
    }),
  );
  if (file) return file;
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

/**
 * Every filter the incident screen offers.
 *
 * Corridor lives on the order, not the incident, so filtering by it necessarily
 * drops incidents that were never linked to one. That is the honest result: an
 * unlinked incident has no corridor to belong to.
 */
function incidentFilters(
  sp: Record<string, string>,
  user: Parameters<typeof areaScope>[0],
): Prisma.DamageReportWhereInput {
  const q = sp.q;
  const from = dayBound(sp.from);
  const to = dayBound(sp.to, true);
  return {
    ...areaScope(user),
    ...(q
      ? {
          OR: [
            { reportNumber: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(sp.status && sp.status in DamageStatus ? { status: sp.status as DamageStatus } : {}),
    ...(sp.claimStatus && sp.claimStatus in ClaimStatus ? { claimStatus: sp.claimStatus as ClaimStatus } : {}),
    ...(sp.incidentType && sp.incidentType in IncidentType ? { incidentType: sp.incidentType as IncidentType } : {}),
    ...(sp.corridor && sp.corridor in CorridorType ? { order: { corridor: sp.corridor as CorridorType } } : {}),
    ...(from || to ? { reportedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
}

/** The KPI ribbon above the incident table. Same filters as the list. */
operationalKpi.get("/damage-reports/summary", requireAuth, requirePermission("kpi:read"), async (c) => {
  const user = c.get("user");
  const rows = await prisma.damageReport.findMany({
    where: incidentFilters(c.req.query(), user),
    select: { currency: true, cargoValue: true, damageValue: true, settlementAmount: true, claimStatus: true, reportedAt: true },
  });
  return ok(c, summarizeIncidents(rows));
});

interface IncidentExportRow {
  reportNumber: string;
  reportedAt: Date;
  status: DamageStatus;
  incidentType: IncidentType;
  rootCause: string;
  location: string | null;
  liableParty: string | null;
  currency: string;
  cargoValue: Prisma.Decimal;
  damageValue: Prisma.Decimal;
  settlementAmount: Prisma.Decimal;
  claimStatus: ClaimStatus;
  claimNumber: string | null;
  insurerName: string | null;
  client: { companyName: string } | null;
  vehicle: { vehicleNumber: string } | null;
  driver: { name: string } | null;
  trip: { tripCode: string } | null;
  order: { orderCode: string } | null;
}

const INCIDENT_EXPORT = {
  title: "Incident Reports",
  columns: [
    { header: "Report", value: (r: IncidentExportRow) => r.reportNumber, width: 14 },
    { header: "Date", value: (r: IncidentExportRow) => r.reportedAt, width: 12 },
    { header: "Customer", value: (r: IncidentExportRow) => r.client?.companyName ?? "", width: 22 },
    { header: "Order", value: (r: IncidentExportRow) => r.order?.orderCode ?? "", width: 14 },
    { header: "Vehicle", value: (r: IncidentExportRow) => r.vehicle?.vehicleNumber ?? "", width: 14 },
    { header: "Trip", value: (r: IncidentExportRow) => r.trip?.tripCode ?? "", width: 14 },
    { header: "Driver", value: (r: IncidentExportRow) => r.driver?.name ?? "", width: 18 },
    { header: "Type", value: (r: IncidentExportRow) => r.incidentType, width: 18 },
    { header: "Location", value: (r: IncidentExportRow) => r.location ?? "", width: 20 },
    { header: "Root cause", value: (r: IncidentExportRow) => r.rootCause, width: 18 },
    { header: "Liable party", value: (r: IncidentExportRow) => r.liableParty ?? "", width: 16 },
    { header: "Currency", value: (r: IncidentExportRow) => r.currency, width: 9 },
    // Decimals go out as numbers so a spreadsheet can total the column.
    { header: "Cargo value", value: (r: IncidentExportRow) => r.cargoValue.toNumber(), width: 13 },
    { header: "Loss", value: (r: IncidentExportRow) => r.damageValue.toNumber(), width: 13 },
    { header: "Damage ratio %", value: (r: IncidentExportRow) => damageRatioPct(r.cargoValue, r.damageValue), width: 12 },
    { header: "Settled", value: (r: IncidentExportRow) => r.settlementAmount.toNumber(), width: 13 },
    { header: "Recovery %", value: (r: IncidentExportRow) => recoveryPct(r.damageValue, r.settlementAmount), width: 11 },
    { header: "Claim status", value: (r: IncidentExportRow) => r.claimStatus, width: 16 },
    { header: "Claim no.", value: (r: IncidentExportRow) => r.claimNumber ?? "", width: 14 },
    { header: "Insurer", value: (r: IncidentExportRow) => r.insurerName ?? "", width: 18 },
    { header: "Status", value: (r: IncidentExportRow) => r.status, width: 14 },
  ],
} satisfies ExportSpec<IncidentExportRow>;

operationalKpi.get("/damage-reports", requireAuth, requirePermission("kpi:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize } = paginationSchema.parse(sp);
  const where = incidentFilters(sp, user);

  const file = await exportIfRequested(c, INCIDENT_EXPORT, (take) =>
    prisma.damageReport.findMany({
      where,
      include: {
        order: { select: { orderCode: true } },
        client: { select: { companyName: true } },
        vehicle: { select: { vehicleNumber: true } },
        driver: { select: { name: true } },
        trip: { select: { tripCode: true } },
      },
      orderBy: { reportedAt: "desc" },
      take,
    }),
  );
  if (file) return file;
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
