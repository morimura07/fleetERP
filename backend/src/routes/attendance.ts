import { Hono } from "hono";
import { Prisma, TimesheetStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  timeEntrySchema, clockOutSchema, buildTimesheetSchema, paginationSchema,
  shiftCodeSchema, rosterEntrySchema, rosterPlanSchema, shiftActivitySchema, endActivitySchema,
  publicHolidaySchema, timePolicySchema,
} from "@backend/lib/validations";
import {
  recordEntry, clockOut, deleteEntry, entryDetail,
  buildTimesheet, submitTimesheet, reviewTimesheet, entryHours,
} from "@backend/services/attendance";
import {
  policyFor, updatePolicy, listShiftCodes, createShiftCode, updateShiftCode,
  listRoster, setRosterEntry, planRoster, deleteRosterEntry,
  listPublicHolidays, addPublicHoliday, deletePublicHoliday,
  startActivity, endActivity, updateActivity, deleteActivity, hoursOfServiceFor,
} from "@backend/services/time-management";
import { currentDutyStatus, lateMinutes } from "@backend/services/time-engine";
import { logActivity } from "@backend/lib/activity";
import { areaScope, areaForWrite, assertSameArea } from "@backend/lib/scope";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { requireVersion } from "@backend/lib/concurrency";
import { ok, created, pageMeta } from "@backend/lib/http";
import { AuthError } from "@backend/lib/errors";

export const attendance = new Hono();

const dateParam = (v: string | undefined, fallback: Date): Date => {
  if (!v) return fallback;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AuthError(`Not a date: ${v}`, 422);
  return d;
};

// ── Time entries ──────────────────────────────────────────────────────────────

/** List time entries (paginated, searchable by employee, filterable by open shifts). */
attendance.get("/entries", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const { page, pageSize, q } = paginationSchema.parse(sp);
  const employeeId = sp.employeeId;

  const where: Prisma.TimeEntryWhereInput = {
    ...areaScope(user),
    ...(employeeId ? { employeeId } : {}),
    ...(sp.open === "true" ? { clockOut: null } : {}),
    ...(sp.tripId ? { tripId: sp.tripId } : {}),
    ...(q ? { employee: { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      include: {
        employee: { select: { code: true, name: true } },
        shiftCode: { select: { code: true, name: true } },
        vehicle: { select: { vehicleNumber: true } },
        activities: { where: { endedAt: null }, select: { kind: true, startedAt: true, endedAt: true } },
      },
      orderBy: [{ workDate: "desc" }, { clockIn: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.timeEntry.count({ where }),
  ]);
  return ok(
    c,
    items.map((e) => ({
      ...e,
      hours: entryHours(e.clockIn, e.clockOut).toFixed(2),
      lateMinutes: lateMinutes(e.scheduledStart, e.clockIn),
      dutyStatus: currentDutyStatus(e),
    })),
    pageMeta(page, pageSize, total),
  );
});

/** Record a clock-in (with optional clock-out for a completed shift). */
attendance.post("/entries", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const body = timeEntrySchema.parse(await c.req.json());
  const entry = await recordEntry({
    ...body,
    dataAreaId: areaForWrite(user, body.dataAreaId),
    clockOut: body.clockOut ?? null,
    note: body.note ?? null,
    createdById: user.id,
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `TimeEntry:${entry.id}` });
  return created(c, entry);
});

/** One entry with its tasks, schedule, duty status and split. */
attendance.get("/entries/:id", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  return ok(c, await entryDetail(existing.dataAreaId, id));
});

/** Close an open entry. Body: { at, lat?, lng?, place? }. */
attendance.post("/entries/:id/clock-out", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = clockOutSchema.parse(await c.req.json());
  const entry = await clockOut(existing.dataAreaId, id, body, user.id);
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

// ── Tasks inside a shift ─────────────────────────────────────────────────────

/** Start a task (or record a finished one). */
attendance.post("/entries/:id/activities", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.timeEntry.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = shiftActivitySchema.parse(await c.req.json());
  const act = await startActivity(existing.dataAreaId, id, user.id, body);
  await logActivity({ userId: user.id, action: "CREATE", target: `ShiftActivity:${act.id}`, detail: { kind: act.kind } });
  return created(c, act);
});

/** End the task. Body: { at?, lat?, lng?, place? }. */
attendance.post("/activities/:id/end", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.shiftActivity.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const body = endActivitySchema.parse(await c.req.json());
  const act = await endActivity(existing.dataAreaId, id, user.id, body);
  await logActivity({ userId: user.id, action: "END", target: `ShiftActivity:${id}` });
  return ok(c, act);
});

attendance.patch("/activities/:id", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.shiftActivity.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = shiftActivitySchema.partial().parse(raw);
  const act = await updateActivity(existing.dataAreaId, id, version, user.id, body);
  await logActivity({ userId: user.id, action: "UPDATE", target: `ShiftActivity:${id}` });
  return ok(c, act);
});

attendance.delete("/activities/:id", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.shiftActivity.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const res = await deleteActivity(existing.dataAreaId, id);
  await logActivity({ userId: user.id, action: "DELETE", target: `ShiftActivity:${id}` });
  return ok(c, res);
});

// ── Hours of service ─────────────────────────────────────────────────────────

/** Where an employee stands against the policy right now. */
attendance.get("/employees/:id/hos", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.employee.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const at = dateParam(c.req.query("at"), new Date());
  return ok(c, await hoursOfServiceFor(existing.dataAreaId, id, at));
});

// ── Shift codes ──────────────────────────────────────────────────────────────

attendance.get("/shift-codes", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  return ok(c, await listShiftCodes(areaScope(user), c.req.query("includeInactive") === "true"));
});

attendance.post("/shift-codes", requireAuth, requirePermission("attendance:approve"), async (c) => {
  const user = c.get("user");
  const raw = await c.req.json();
  const body = shiftCodeSchema.parse(raw);
  const dataAreaId = areaForWrite(user, typeof raw.dataAreaId === "string" ? raw.dataAreaId : undefined);
  const code = await createShiftCode(dataAreaId, user.id, body);
  await logActivity({ userId: user.id, action: "CREATE", target: `ShiftCode:${code.id}`, detail: { code: code.code } });
  return created(c, code);
});

attendance.patch("/shift-codes/:id", requireAuth, requirePermission("attendance:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.shiftCode.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = shiftCodeSchema.partial().parse(raw);
  const code = await updateShiftCode(id, version, user.id, body);
  await logActivity({ userId: user.id, action: "UPDATE", target: `ShiftCode:${id}` });
  return ok(c, code);
});

// ── Roster ───────────────────────────────────────────────────────────────────

/** The plan for a date range (default: this week), optionally one employee. */
attendance.get("/roster", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  const sp = c.req.query();
  const today = new Date(new Date().toISOString().slice(0, 10));
  const from = dateParam(sp.from, today);
  const to = dateParam(sp.to, new Date(from.getTime() + 6 * 86_400_000));
  if ((to.getTime() - from.getTime()) / 86_400_000 > 92) throw new AuthError("A roster view covers at most 92 days", 422);
  const where: Prisma.RosterEntryWhereInput = { ...areaScope(user), ...(sp.employeeId ? { employeeId: sp.employeeId } : {}) };
  return ok(c, await listRoster(where, from, to));
});

/** Set one person's shift for one day (replaces what was planned). */
attendance.put("/roster", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const raw = await c.req.json();
  const body = rosterEntrySchema.parse(raw);
  const dataAreaId = areaForWrite(user, typeof raw.dataAreaId === "string" ? raw.dataAreaId : undefined);
  const row = await setRosterEntry(dataAreaId, user.id, body);
  await logActivity({ userId: user.id, action: "UPSERT", target: `RosterEntry:${row.id}` });
  return ok(c, row);
});

/** Plan one shift code for several people across a date range. */
attendance.post("/roster/plan", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const raw = await c.req.json();
  const body = rosterPlanSchema.parse(raw);
  const dataAreaId = areaForWrite(user, typeof raw.dataAreaId === "string" ? raw.dataAreaId : undefined);
  const res = await planRoster(dataAreaId, user.id, body);
  await logActivity({ userId: user.id, action: "PLAN", target: `Roster:${dataAreaId}`, detail: { ...res, employees: body.employeeIds.length } });
  return ok(c, res);
});

attendance.delete("/roster/:id", requireAuth, requirePermission("attendance:write"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.rosterEntry.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const res = await deleteRosterEntry(existing.dataAreaId, id);
  await logActivity({ userId: user.id, action: "DELETE", target: `RosterEntry:${id}` });
  return ok(c, res);
});

// ── Public holidays ──────────────────────────────────────────────────────────

attendance.get("/public-holidays", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  const year = c.req.query("year") ? Number(c.req.query("year")) : undefined;
  if (year !== undefined && !(year >= 2000 && year <= 2100)) throw new AuthError("year must be 2000-2100", 422);
  return ok(c, await listPublicHolidays(areaScope(user), year));
});

attendance.post("/public-holidays", requireAuth, requirePermission("attendance:approve"), async (c) => {
  const user = c.get("user");
  const raw = await c.req.json();
  const body = publicHolidaySchema.parse(raw);
  const dataAreaId = areaForWrite(user, typeof raw.dataAreaId === "string" ? raw.dataAreaId : undefined);
  const row = await addPublicHoliday(dataAreaId, user.id, body);
  await logActivity({ userId: user.id, action: "CREATE", target: `PublicHoliday:${row.id}`, detail: { name: row.name } });
  return created(c, row);
});

attendance.delete("/public-holidays/:id", requireAuth, requirePermission("attendance:approve"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.publicHoliday.findUnique({ where: { id }, select: { dataAreaId: true } });
  assertSameArea(user, existing);
  const res = await deletePublicHoliday(existing.dataAreaId, id);
  await logActivity({ userId: user.id, action: "DELETE", target: `PublicHoliday:${id}` });
  return ok(c, res);
});

// ── Working-time policy ──────────────────────────────────────────────────────

/** The company's policy, created with the defaults on first read. */
attendance.get("/policy", requireAuth, requirePermission("attendance:read"), async (c) => {
  const user = c.get("user");
  const dataAreaId = areaForWrite(user, c.req.query("dataAreaId"));
  return ok(c, await policyFor(dataAreaId));
});

attendance.patch("/policy", requireAuth, requirePermission("company:manage"), async (c) => {
  const user = c.get("user");
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = timePolicySchema.parse(raw);
  const dataAreaId = areaForWrite(user, typeof raw.dataAreaId === "string" ? raw.dataAreaId : undefined);
  const policy = await updatePolicy(dataAreaId, version, user.id, body);
  await logActivity({ userId: user.id, action: "UPDATE", target: `TimePolicy:${dataAreaId}` });
  return ok(c, policy);
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
      entries: { orderBy: { workDate: "asc" }, include: { shiftCode: { select: { code: true } } } },
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
  const sheet = await buildTimesheet(dataAreaId, body.employeeId, body.period, body.overtimeRate, user.id);
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
