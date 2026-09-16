import { Hono } from "hono";
import { Prisma, TimesheetStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  timeEntrySchema, clockOutSchema, buildTimesheetSchema, paginationSchema,
} from "@backend/lib/validations";
import {
  recordEntry, clockOut, deleteEntry,
  buildTimesheet, submitTimesheet, reviewTimesheet, entryHours,
} from "@backend/services/attendance";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";

export const attendance = new Hono();

// ── Time entries ──────────────────────────────────────────────────────────────

/** List time entries (paginated, searchable by employee). */
attendance.get("/entries", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const employeeId = sp.employeeId;

  const where: Prisma.TimeEntryWhereInput = {
    ...areaScope(user),
    ...(employeeId ? { employeeId } : {}),
    ...(q ? { employee: { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      include: { employee: { select: { code: true, name: true } } },
      orderBy: [{ workDate: "desc" }, { clockIn: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.timeEntry.count({ where }),
  ]);
  return ok(c, items.map((e) => ({ ...e, hours: entryHours(e.clockIn, e.clockOut).toFixed(2) })), pageMeta(page, pageSize, total));
});

/** Record a clock-in (with optional clock-out for a completed shift). */
attendance.post("/entries", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const body = timeEntrySchema.parse(await c.req.json());
  const entry = await recordEntry({
    dataAreaId: areaForWrite(user, body.dataAreaId),
    employeeId: body.employeeId,
    workDate: body.workDate,
    clockIn: body.clockIn,
    clockOut: body.clockOut ?? null,
    source: body.source,
    note: body.note ?? null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `TimeEntry:${entry.id}` });
  return created(c, entry);
});

/** Close an open entry. Body: { at }. */
attendance.post("/entries/:id/clock-out", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const { at } = clockOutSchema.parse(await c.req.json());
  const entry = await clockOut(existing.dataAreaId, id, at, user.id);
  await logActivity({ userId: user.id, action: "CLOCK_OUT", target: `TimeEntry:${id}` });
  return ok(c, entry);
});

attendance.delete("/entries/:id", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const res = await deleteEntry(existing.dataAreaId, id);
  await logActivity({ userId: user.id, action: "DELETE", target: `TimeEntry:${id}` });
  return ok(c, res);
});

// ── Timesheets ────────────────────────────────────────────────────────────────

/** List timesheets (paginated, filterable by status). */
attendance.get("/timesheets", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const status = sp.status;

  const where: Prisma.TimesheetWhereInput = {
    ...areaScope(user),
    ...(status && status in TimesheetStatus ? { status: status as TimesheetStatus } : {}),
    ...(q ? { OR: [{ period: { contains: q } }, { employee: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.timesheet.findMany({
      where,
      include: { employee: { select: { code: true, name: true } } },
      orderBy: [{ period: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.timesheet.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

/** Timesheet detail with its entries. */
attendance.get("/timesheets/:id", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const sheet = await prisma.timesheet.findUnique({
    where: { id },
    include: {
      employee: { select: { code: true, name: true } },
      entries: { orderBy: { workDate: "asc" } },
    },
  });
  assertSameArea(user, sheet);
  return ok(c, { ...sheet, entries: sheet.entries.map((e) => ({ ...e, hours: entryHours(e.clockIn, e.clockOut).toFixed(2) })) });
});

/** Build (or rebuild) an OPEN timesheet from the period's entries. */
attendance.post("/timesheets/build", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const body = buildTimesheetSchema.parse(await c.req.json());
  const dataAreaId = areaForWrite(user, body.dataAreaId);
  const sheet = await buildTimesheet(dataAreaId, body.employeeId, body.period, body.overtimeRate ?? 0, user.id);
  await logActivity({ userId: user.id, action: "BUILD", target: `Timesheet:${sheet.id}`, detail: { period: body.period } });
  return ok(c, sheet);
});

/** OPEN → SUBMITTED. */
attendance.post("/timesheets/:id/submit", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.timesheet.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const sheet = await submitTimesheet(existing.dataAreaId, id, user.id);
  await logActivity({ userId: user.id, action: "SUBMIT", target: `Timesheet:${id}` });
  return ok(c, sheet);
});

/** SUBMITTED → APPROVED | REJECTED. Body: { approve: boolean }. */
attendance.post("/timesheets/:id/review", requireAuth, requirePermission("attendance:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.timesheet.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const { approve } = (await c.req.json()) as { approve?: boolean };
  const sheet = await reviewTimesheet(existing.dataAreaId, id, approve !== false, user.id);
  await logActivity({ userId: user.id, action: approve !== false ? "APPROVE" : "REJECT", target: `Timesheet:${id}` });
  return ok(c, sheet);
});
