import { Prisma } from "@prisma/client";
import type { ShiftActivity, TimePolicy } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { updateWithVersion } from "@backend/lib/concurrency";
import type {
  ShiftCodeInput, RosterEntryInput, RosterPlanInput, ShiftActivityInput, EndActivityInput, PublicHolidayInput, TimePolicyInput,
} from "@backend/lib/validations";
import {
  DEFAULT_POLICY, WEEKDAYS, activityConflict, hoursOfService, parseClock, parseRestDays,
  type TimePolicyRules, type HosStatus,
} from "@backend/services/time-engine";

/**
 * Time management, the database-bound half: shift codes, the roster, tasks
 * inside a shift, public holidays, the working-time policy and the
 * hours-of-service position. The rules themselves live in time-engine.ts;
 * this file loads what they need and stores what they produce.
 */

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" of a date-only column value. */
export const dateKeyOf = (d: Date) => d.toISOString().slice(0, 10);

// ── Policy ───────────────────────────────────────────────────────────────────

/** The company's policy, created with the Tanzanian defaults on first use. */
export async function policyFor(dataAreaId: string): Promise<TimePolicy> {
  const existing = await prisma.timePolicy.findUnique({ where: { dataAreaId } });
  if (existing) return existing;
  return prisma.timePolicy.create({
    data: {
      dataAreaId,
      source: "Employment and Labour Relations Act 2004 (Tanzania), s.19-20: 45 hours a week, 9 a day, overtime at 1.5, rest days at 2, night work 5%. Driving limits are a starting point, not law; set them to the company's own rule.",
    },
  });
}

/** The policy row as the engine wants it. */
export function toRules(p: TimePolicy): TimePolicyRules {
  return {
    standardDailyHours: p.standardDailyHours,
    standardWeeklyHours: p.standardWeeklyHours,
    overtimeMultiplier: p.overtimeMultiplier,
    restDayMultiplier: p.restDayMultiplier,
    nightPremiumPct: p.nightPremiumPct,
    restDays: p.restDays,
    nightStart: p.nightStart,
    nightEnd: p.nightEnd,
    standardMonthlyHours: p.standardMonthlyHours,
    maxDrivingHoursPerShift: p.maxDrivingHoursPerShift,
    maxDutyHoursPerShift: p.maxDutyHoursPerShift,
    breakAfterDrivingHours: p.breakAfterDrivingHours,
    minBreakMinutes: p.minBreakMinutes,
    maxWeeklyDutyHours: p.maxWeeklyDutyHours,
    warnBeforeLimitHours: p.warnBeforeLimitHours,
  };
}

export async function updatePolicy(dataAreaId: string, version: number, userId: string, input: TimePolicyInput) {
  const current = await policyFor(dataAreaId);
  // The engine parses these; a value it would reject must not be stored.
  if (input.restDays != null) parseRestDays(input.restDays);
  if (input.nightStart != null) parseClock(input.nightStart);
  if (input.nightEnd != null) parseClock(input.nightEnd);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) data[k] = v === "" ? null : v;
  return updateWithVersion<TimePolicy>(prisma.timePolicy, current.id, version, userId, data);
}

// ── Shift codes ──────────────────────────────────────────────────────────────

export async function listShiftCodes(where: Prisma.ShiftCodeWhereInput, includeInactive: boolean) {
  return prisma.shiftCode.findMany({
    where: { ...where, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ code: "asc" }],
  });
}

export async function createShiftCode(dataAreaId: string, userId: string, input: ShiftCodeInput) {
  parseClock(input.startTime);
  parseClock(input.endTime);
  const clash = await prisma.shiftCode.findUnique({ where: { dataAreaId_code: { dataAreaId, code: input.code } } });
  if (clash) throw new AuthError(`Shift code ${input.code} already exists`, 409);
  return prisma.shiftCode.create({
    data: {
      dataAreaId, code: input.code, name: input.name, startTime: input.startTime, endTime: input.endTime,
      isNight: input.isNight, shiftAllowance: input.shiftAllowance, note: input.note || null, isActive: input.isActive,
      createdById: userId,
    },
  });
}

export async function updateShiftCode(id: string, version: number, userId: string, input: Partial<ShiftCodeInput>) {
  if (input.startTime != null) parseClock(input.startTime);
  if (input.endTime != null) parseClock(input.endTime);
  const data: Record<string, unknown> = {};
  for (const k of ["name", "startTime", "endTime", "isNight", "shiftAllowance", "isActive"] as const) {
    if (input[k] !== undefined) data[k] = input[k];
  }
  if (input.note !== undefined) data.note = input.note || null;
  // The code is the identity other records refer to; it does not change.
  return updateWithVersion(prisma.shiftCode, id, version, userId, data);
}

// ── Roster ───────────────────────────────────────────────────────────────────

async function assertEmployeesInArea(dataAreaId: string, employeeIds: string[]) {
  const found = await prisma.employee.findMany({ where: { id: { in: employeeIds }, dataAreaId }, select: { id: true } });
  if (found.length !== new Set(employeeIds).size) throw new AuthError("Employee not found in this company", 404);
}

async function assertShiftCodeInArea(dataAreaId: string, shiftCodeId: string) {
  const code = await prisma.shiftCode.findFirst({ where: { id: shiftCodeId, dataAreaId, isActive: true } });
  if (!code) throw new AuthError("Shift code not found in this company", 404);
  return code;
}

async function assertOptionalRefsInArea(dataAreaId: string, tripId?: string | null, vehicleId?: string | null) {
  if (tripId) {
    const t = await prisma.trip.findFirst({ where: { id: tripId, dataAreaId }, select: { id: true } });
    if (!t) throw new AuthError("Trip not found in this company", 404);
  }
  if (vehicleId) {
    const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, dataAreaId }, select: { id: true } });
    if (!v) throw new AuthError("Vehicle not found in this company", 404);
  }
}

export async function listRoster(where: Prisma.RosterEntryWhereInput, from: Date, to: Date) {
  return prisma.rosterEntry.findMany({
    where: { ...where, date: { gte: from, lte: to } },
    include: {
      employee: { select: { code: true, name: true } },
      shiftCode: { select: { code: true, name: true, startTime: true, endTime: true, isNight: true } },
      trip: { select: { id: true, originFacility: true, destinationFacility: true, scheduledStart: true } },
      vehicle: { select: { vehicleNumber: true, plateNumber: true } },
    },
    orderBy: [{ date: "asc" }, { employee: { name: "asc" } }],
  });
}

/** One person, one day. Replaces whatever was planned for that day. */
export async function setRosterEntry(dataAreaId: string, userId: string, input: RosterEntryInput) {
  await assertEmployeesInArea(dataAreaId, [input.employeeId]);
  await assertShiftCodeInArea(dataAreaId, input.shiftCodeId);
  await assertOptionalRefsInArea(dataAreaId, input.tripId, input.vehicleId);
  const date = new Date(dateKeyOf(input.date));
  const data = {
    shiftCodeId: input.shiftCodeId, tripId: input.tripId || null, vehicleId: input.vehicleId || null, note: input.note || null,
  };
  return prisma.rosterEntry.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date } },
    update: { ...data, updatedById: userId, version: { increment: 1 } },
    create: { dataAreaId, employeeId: input.employeeId, date, ...data, createdById: userId },
  });
}

/**
 * Plan a shift for several people across a date range. Days already planned
 * are left alone unless `replace` is set, so a roster can be filled in
 * around exceptions that were entered by hand.
 */
export async function planRoster(dataAreaId: string, userId: string, input: RosterPlanInput) {
  await assertEmployeesInArea(dataAreaId, input.employeeIds);
  await assertShiftCodeInArea(dataAreaId, input.shiftCodeId);
  const from = new Date(dateKeyOf(input.from));
  const to = new Date(dateKeyOf(input.to));
  const wanted = new Set(input.weekdays);
  const dates: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const d = new Date(t);
    if (wanted.size === 0 || wanted.has(WEEKDAYS[d.getUTCDay()] as RosterPlanInput["weekdays"][number])) dates.push(d);
  }
  const employeeIds = [...new Set(input.employeeIds)];
  return prisma.$transaction(async (tx) => {
    if (input.replace) {
      await tx.rosterEntry.deleteMany({ where: { dataAreaId, employeeId: { in: employeeIds }, date: { in: dates } } });
    }
    const res = await tx.rosterEntry.createMany({
      data: employeeIds.flatMap((employeeId) =>
        dates.map((date) => ({ dataAreaId, employeeId, date, shiftCodeId: input.shiftCodeId, createdById: userId })),
      ),
      skipDuplicates: true,
    });
    return { planned: res.count, skipped: employeeIds.length * dates.length - res.count, days: dates.length };
  });
}

export async function deleteRosterEntry(dataAreaId: string, id: string) {
  const row = await prisma.rosterEntry.findFirst({ where: { id, dataAreaId }, select: { id: true } });
  if (!row) throw new AuthError("Roster entry not found", 404);
  await prisma.rosterEntry.delete({ where: { id } });
  return { ok: true };
}

// ── Public holidays ──────────────────────────────────────────────────────────

export async function listPublicHolidays(where: Prisma.PublicHolidayWhereInput, year?: number) {
  return prisma.publicHoliday.findMany({
    where: { ...where, ...(year ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } : {}) },
    orderBy: { date: "asc" },
  });
}

export async function addPublicHoliday(dataAreaId: string, userId: string, input: PublicHolidayInput) {
  const date = new Date(dateKeyOf(input.date));
  const clash = await prisma.publicHoliday.findUnique({ where: { dataAreaId_date: { dataAreaId, date } } });
  if (clash) throw new AuthError(`${dateKeyOf(date)} is already a public holiday (${clash.name})`, 409);
  return prisma.publicHoliday.create({ data: { dataAreaId, date, name: input.name, createdById: userId } });
}

export async function deletePublicHoliday(dataAreaId: string, id: string) {
  const row = await prisma.publicHoliday.findFirst({ where: { id, dataAreaId }, select: { id: true } });
  if (!row) throw new AuthError("Public holiday not found", 404);
  await prisma.publicHoliday.delete({ where: { id } });
  return { ok: true };
}

/** Holiday date keys in [from, to), for the engine's rest-day check. */
export async function publicHolidayKeys(dataAreaId: string, from: Date, to: Date): Promise<Set<string>> {
  const rows = await prisma.publicHoliday.findMany({ where: { dataAreaId, date: { gte: from, lt: to } }, select: { date: true } });
  return new Set(rows.map((r) => dateKeyOf(r.date)));
}

// ── Activities inside a shift ────────────────────────────────────────────────

async function loadEntryForActivity(dataAreaId: string, timeEntryId: string) {
  const entry = await prisma.timeEntry.findFirst({
    where: { id: timeEntryId, dataAreaId },
    include: { activities: { select: { id: true, kind: true, startedAt: true, endedAt: true } } },
  });
  if (!entry) throw new AuthError("Time entry not found", 404);
  if (entry.timesheetId) {
    const sheet = await prisma.timesheet.findUnique({ where: { id: entry.timesheetId }, select: { status: true } });
    if (sheet && sheet.status !== "OPEN") throw new AuthError("Entry is locked in a submitted timesheet", 409);
  }
  return entry;
}

export async function startActivity(dataAreaId: string, timeEntryId: string, userId: string, input: ShiftActivityInput): Promise<ShiftActivity> {
  const entry = await loadEntryForActivity(dataAreaId, timeEntryId);
  if (entry.clockOut && !input.endedAt) throw new AuthError("The shift is already clocked out; give the task an end time", 422);
  const why = activityConflict(entry, entry.activities, { startedAt: input.startedAt, endedAt: input.endedAt ?? null });
  if (why) throw new AuthError(why, 422);
  return prisma.shiftActivity.create({
    data: {
      dataAreaId, timeEntryId, kind: input.kind, startedAt: input.startedAt, endedAt: input.endedAt ?? null,
      lat: input.lat ?? null, lng: input.lng ?? null, place: input.place || null, note: input.note || null, createdById: userId,
    },
  });
}

export async function endActivity(dataAreaId: string, activityId: string, userId: string, input: EndActivityInput): Promise<ShiftActivity> {
  const act = await prisma.shiftActivity.findFirst({ where: { id: activityId, dataAreaId } });
  if (!act) throw new AuthError("Task not found", 404);
  if (act.endedAt) throw new AuthError("Task is already ended", 409);
  const entry = await loadEntryForActivity(dataAreaId, act.timeEntryId);
  const at = input.at ?? new Date();
  const why = activityConflict(entry, entry.activities, { startedAt: act.startedAt, endedAt: at }, act.id);
  if (why) throw new AuthError(why, 422);
  return prisma.shiftActivity.update({
    where: { id: act.id },
    data: {
      endedAt: at, updatedById: userId, version: { increment: 1 },
      // A closing location is recorded only when the task had none; a task
      // that moves (driving) keeps where it started.
      ...(act.lat == null && input.lat != null ? { lat: input.lat, lng: input.lng ?? null } : {}),
      ...(!act.place && input.place ? { place: input.place } : {}),
    },
  });
}

export async function updateActivity(dataAreaId: string, activityId: string, version: number, userId: string, input: Partial<ShiftActivityInput>) {
  const act = await prisma.shiftActivity.findFirst({ where: { id: activityId, dataAreaId } });
  if (!act) throw new AuthError("Task not found", 404);
  const entry = await loadEntryForActivity(dataAreaId, act.timeEntryId);
  const startedAt = input.startedAt ?? act.startedAt;
  const endedAt = input.endedAt === undefined ? act.endedAt : input.endedAt;
  const why = activityConflict(entry, entry.activities, { startedAt, endedAt }, act.id);
  if (why) throw new AuthError(why, 422);
  const data: Record<string, unknown> = { startedAt, endedAt };
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.lat !== undefined) data.lat = input.lat;
  if (input.lng !== undefined) data.lng = input.lng;
  if (input.place !== undefined) data.place = input.place || null;
  if (input.note !== undefined) data.note = input.note || null;
  return updateWithVersion<ShiftActivity>(prisma.shiftActivity, act.id, version, userId, data);
}

export async function deleteActivity(dataAreaId: string, activityId: string) {
  const act = await prisma.shiftActivity.findFirst({ where: { id: activityId, dataAreaId }, select: { id: true, timeEntryId: true } });
  if (!act) throw new AuthError("Task not found", 404);
  await loadEntryForActivity(dataAreaId, act.timeEntryId); // lock check
  await prisma.shiftActivity.delete({ where: { id: act.id } });
  return { ok: true };
}

// ── Hours of service ─────────────────────────────────────────────────────────

/** Where an employee stands against the policy right now. */
export async function hoursOfServiceFor(dataAreaId: string, employeeId: string, now = new Date()): Promise<HosStatus & { policyVerified: boolean }> {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, dataAreaId }, select: { id: true } });
  if (!employee) throw new AuthError("Employee not found in this company", 404);
  const policy = await policyFor(dataAreaId);
  const since = new Date(now.getTime() - 8 * DAY_MS);
  const entries = await prisma.timeEntry.findMany({
    where: { dataAreaId, employeeId, OR: [{ clockOut: null }, { clockIn: { gte: since } }] },
    include: { activities: { select: { kind: true, startedAt: true, endedAt: true } } },
    orderBy: { clockIn: "desc" },
  });
  const current = entries.find((e) => !e.clockOut) ?? null;
  const status = hoursOfService({ now, current, recent: entries }, toRules(policy));
  return { ...status, policyVerified: policy.verifiedAt != null };
}

export { DEFAULT_POLICY };
