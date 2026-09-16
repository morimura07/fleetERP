import { Prisma } from "@prisma/client";
import type { AttendanceSource } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { dispatchHolds, type Hold } from "@backend/services/driver-qualification";
import {
  entryBreakdown, periodTotals, pricePeriod, hourlyRateFor, scheduleWindow, lateMinutes, currentDutyStatus,
} from "@backend/services/time-engine";
import { policyFor, toRules, publicHolidayKeys, dateKeyOf } from "@backend/services/time-management";

/**
 * Time & Attendance (M26), extended for the client's Time Management section.
 *
 *  • TimeEntry — one shift (clockIn → clockOut), now with the shift code,
 *    trip and vehicle it was worked on, where each punch happened, and the
 *    tasks done inside it (ShiftActivity).
 *  • Timesheet — per employee / period (YYYY-MM). Building it runs every
 *    completed shift in the period through the working-time engine against
 *    the company's TimePolicy: breaks off, daily and weekly overtime, rest-day
 *    and public-holiday premium, night hours, and the shift allowances of the
 *    codes worked. Priced from the employee's own rates.
 *  • An APPROVED timesheet's earnings are picked up by Payroll as taxable
 *    additions before the statutory deductions are computed.
 *
 * `entryHours`, `splitHours` and `overtimePay` are the original pure helpers,
 * kept for the entry list and for anyone reading a sheet built before the
 * policy existed.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const MS_PER_HOUR = 3_600_000;

/** Standard paid hours in a month before overtime kicks in (≈22 workdays × 8h). Superseded by TimePolicy. */
export const STANDARD_MONTHLY_HOURS = 176;

/** Hours worked in a single entry (clockOut − clockIn), rounded to 2dp. Pure. */
export function entryHours(clockIn: Date, clockOut: Date | null | undefined): Prisma.Decimal {
  if (!clockOut) return D(0);
  const ms = clockOut.getTime() - clockIn.getTime();
  if (ms <= 0) return D(0);
  return D(ms / MS_PER_HOUR).toDecimalPlaces(2);
}

/** Split total hours into regular + overtime against a monthly threshold. Pure. */
export function splitHours(
  totalHours: Prisma.Decimal.Value,
  threshold: Prisma.Decimal.Value = STANDARD_MONTHLY_HOURS,
): { regular: Prisma.Decimal; overtime: Prisma.Decimal } {
  const total = D(totalHours);
  const thr = D(threshold);
  if (total.lessThanOrEqualTo(thr)) return { regular: total, overtime: D(0) };
  return { regular: thr, overtime: total.minus(thr) };
}

/** Overtime pay = overtime hours × OT rate, to 2dp. Pure. */
export function overtimePay(overtimeHours: Prisma.Decimal.Value, rate: Prisma.Decimal.Value): Prisma.Decimal {
  return D(overtimeHours).times(rate).toDecimalPlaces(2);
}

function periodBounds(period: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new AuthError("period must be YYYY-MM", 422);
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) }; // [start, end)
}

// ── Time entries ──────────────────────────────────────────────────────────────

export interface TimeEntryInput {
  dataAreaId: string;
  employeeId: string;
  workDate: Date;
  clockIn: Date;
  clockOut?: Date | null;
  source?: AttendanceSource;
  note?: string | null;
  shiftCodeId?: string | null;
  tripId?: string | null;
  vehicleId?: string | null;
  clockInLat?: number | null;
  clockInLng?: number | null;
  clockInPlace?: string | null;
  clockOutLat?: number | null;
  clockOutLng?: number | null;
  clockOutPlace?: string | null;
  createdById?: string | null;
}

/**
 * Record a clock-in (or a whole completed shift).
 *
 * The roster fills in what the caller left out: if the person was planned
 * for that day, the shift code, trip and vehicle come from the plan, and the
 * planned window is snapshotted so lateness stays checkable. A driver's
 * qualification holds are returned alongside, as a warning the dispatcher
 * sees, not a refusal: the person is already at the gate.
 */
export async function recordEntry(input: TimeEntryInput) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, dataAreaId: input.dataAreaId },
    select: { id: true, driverId: true },
  });
  if (!employee) throw new AuthError("Employee not found in this company", 404);
  if (input.clockOut && input.clockOut <= input.clockIn) {
    throw new AuthError("Clock-out must be after clock-in", 422);
  }
  if (!input.clockOut) {
    const open = await prisma.timeEntry.findFirst({ where: { employeeId: employee.id, clockOut: null }, select: { id: true, clockIn: true } });
    if (open) throw new AuthError(`Already clocked in since ${open.clockIn.toISOString()}; clock out first`, 409);
  }

  const workDate = new Date(dateKeyOf(input.workDate));
  const roster = await prisma.rosterEntry.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date: workDate } },
    select: { shiftCodeId: true, tripId: true, vehicleId: true },
  });
  const shiftCodeId = input.shiftCodeId ?? roster?.shiftCodeId ?? null;
  const tripId = input.tripId ?? roster?.tripId ?? null;
  const vehicleId = input.vehicleId ?? roster?.vehicleId ?? null;

  let scheduled: { start: Date; end: Date } | null = null;
  if (shiftCodeId) {
    const code = await prisma.shiftCode.findFirst({ where: { id: shiftCodeId, dataAreaId: input.dataAreaId }, select: { startTime: true, endTime: true } });
    if (!code) throw new AuthError("Shift code not found in this company", 404);
    scheduled = scheduleWindow(dateKeyOf(workDate), code);
  }
  if (tripId) {
    const t = await prisma.trip.findFirst({ where: { id: tripId, dataAreaId: input.dataAreaId }, select: { id: true } });
    if (!t) throw new AuthError("Trip not found in this company", 404);
  }
  if (vehicleId) {
    const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, dataAreaId: input.dataAreaId }, select: { id: true } });
    if (!v) throw new AuthError("Vehicle not found in this company", 404);
  }

  const entry = await prisma.timeEntry.create({
    data: {
      dataAreaId: input.dataAreaId,
      employeeId: input.employeeId,
      workDate,
      clockIn: input.clockIn,
      clockOut: input.clockOut ?? null,
      source: input.source ?? "MANUAL",
      note: input.note ?? null,
      shiftCodeId, tripId, vehicleId,
      scheduledStart: scheduled?.start ?? null,
      scheduledEnd: scheduled?.end ?? null,
      clockInLat: input.clockInLat ?? null,
      clockInLng: input.clockInLng ?? null,
      clockInPlace: input.clockInPlace || null,
      clockOutLat: input.clockOutLat ?? null,
      clockOutLng: input.clockOutLng ?? null,
      clockOutPlace: input.clockOutPlace || null,
      createdById: input.createdById ?? null,
    },
  });

  return { ...entry, lateMinutes: lateMinutes(entry.scheduledStart, entry.clockIn), holds: await holdsFor(employee.driverId, input.clockIn) };
}

/** A linked driver's qualification holds at the moment of clock-in. */
async function holdsFor(driverId: string | null, asOf: Date): Promise<Hold[]> {
  if (!driverId) return [];
  const [driver, docs, events] = await Promise.all([
    prisma.driver.findUnique({ where: { id: driverId }, select: { status: true, licenseExpiry: true, medicalCertExpiry: true } }),
    prisma.driverDocument.findMany({ where: { driverId }, select: { type: true, expiresAt: true } }),
    prisma.driverEvent.findMany({ where: { driverId }, select: { kind: true, occurredAt: true, renewalDue: true, outcome: true, sapReferral: true } }),
  ]);
  return driver ? dispatchHolds(driver, docs, events, asOf) : [];
}

export interface ClockOutInput {
  at: Date;
  lat?: number | null;
  lng?: number | null;
  place?: string | null;
}

/** Close an open entry. Any task still running is ended at the same moment. */
export async function clockOut(dataAreaId: string, entryId: string, input: ClockOutInput, userId?: string | null) {
  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, dataAreaId } });
  if (!entry) throw new AuthError("Time entry not found", 404);
  if (entry.clockOut) throw new AuthError("Entry is already clocked out", 409);
  if (entry.timesheetId) throw new AuthError("Entry is locked in a timesheet", 409);
  if (input.at <= entry.clockIn) throw new AuthError("Clock-out must be after clock-in", 422);
  return prisma.$transaction(async (tx) => {
    await tx.shiftActivity.updateMany({
      where: { timeEntryId: entry.id, endedAt: null, startedAt: { lt: input.at } },
      data: { endedAt: input.at, updatedById: userId ?? null },
    });
    return tx.timeEntry.update({
      where: { id: entry.id },
      data: {
        clockOut: input.at, updatedById: userId ?? null,
        clockOutLat: input.lat ?? null, clockOutLng: input.lng ?? null, clockOutPlace: input.place || null,
      },
    });
  });
}

export async function deleteEntry(dataAreaId: string, entryId: string) {
  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, dataAreaId } });
  if (!entry) throw new AuthError("Time entry not found", 404);
  if (entry.timesheetId) throw new AuthError("Cannot delete an entry locked in a timesheet", 409);
  await prisma.timeEntry.delete({ where: { id: entry.id } });
  return { ok: true };
}

/** One entry with its tasks and everything derived from them. */
export async function entryDetail(dataAreaId: string, entryId: string) {
  const entry = await prisma.timeEntry.findFirst({
    where: { id: entryId, dataAreaId },
    include: {
      employee: { select: { code: true, name: true, jobTitle: true, driverId: true } },
      shiftCode: { select: { code: true, name: true, startTime: true, endTime: true, isNight: true, shiftAllowance: true } },
      trip: { select: { id: true, originFacility: true, destinationFacility: true, corridor: true, scheduledStart: true, scheduledEnd: true, status: true } },
      vehicle: { select: { vehicleNumber: true, plateNumber: true } },
      activities: { orderBy: { startedAt: "asc" } },
      timesheet: { select: { id: true, period: true, status: true } },
    },
  });
  if (!entry) throw new AuthError("Time entry not found", 404);
  const policy = await policyFor(dataAreaId);
  // A holiday makes every hour premium, so the day's status is part of the detail.
  const holidays = await publicHolidayKeys(dataAreaId, entry.workDate, new Date(entry.workDate.getTime() + 86_400_000));
  const breakdown = entry.clockOut
    ? entryBreakdown({ clockIn: entry.clockIn, clockOut: entry.clockOut, activities: entry.activities }, toRules(policy), (key) => holidays.has(key))
    : null;
  return {
    ...entry,
    hours: entryHours(entry.clockIn, entry.clockOut).toFixed(2),
    lateMinutes: lateMinutes(entry.scheduledStart, entry.clockIn),
    dutyStatus: currentDutyStatus(entry),
    breakdown,
  };
}

// ── Timesheets ────────────────────────────────────────────────────────────────

/**
 * Build (or rebuild) an OPEN timesheet for an employee/period from every
 * completed shift in the period, through the engine against the company's
 * policy. Idempotent while OPEN. Fails if the timesheet is already submitted.
 * `overtimeRateOverride` is a one-off agreed rate; otherwise the employee's
 * contractual rate, else hourly x the policy multiplier.
 */
export async function buildTimesheet(
  dataAreaId: string,
  employeeId: string,
  period: string,
  overtimeRateOverride: Prisma.Decimal.Value | null | undefined,
  createdById?: string | null,
) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, dataAreaId },
    select: { id: true, hourlyRate: true, overtimeRate: true, basicPay: true, grossSalary: true },
  });
  if (!employee) throw new AuthError("Employee not found in this company", 404);
  if (overtimeRateOverride != null && D(overtimeRateOverride).lessThan(0)) throw new AuthError("Overtime rate cannot be negative", 422);

  const { start, end } = periodBounds(period);

  const existing = await prisma.timesheet.findUnique({ where: { employeeId_period: { employeeId, period } } });
  if (existing && existing.status !== "OPEN") throw new AuthError(`Timesheet is already ${existing.status}`, 409);

  const [policy, holidays, entries] = await Promise.all([
    policyFor(dataAreaId),
    publicHolidayKeys(dataAreaId, start, end),
    prisma.timeEntry.findMany({
      where: { dataAreaId, employeeId, workDate: { gte: start, lt: end }, clockOut: { not: null } },
      include: { activities: { select: { kind: true, startedAt: true, endedAt: true } }, shiftCode: { select: { shiftAllowance: true } } },
    }),
  ]);
  const rules = toRules(policy);
  const shifts = entries.map((e) =>
    entryBreakdown({ clockIn: e.clockIn, clockOut: e.clockOut!, activities: e.activities }, rules, (key) => holidays.has(key)),
  );
  const totals = periodTotals(shifts, rules);
  const hourly = hourlyRateFor(employee, rules);
  const pay = pricePeriod(totals, { hourlyRate: hourly, overtimeRate: overtimeRateOverride ?? employee.overtimeRate }, rules);
  const shiftAllowances = entries.reduce((s, e) => s.plus(e.shiftCode?.shiftAllowance ?? 0), D(0)).toDecimalPlaces(2);

  const figures = {
    regularHours: totals.regular.toFixed(2),
    overtimeHours: totals.overtime.toFixed(2),
    overtimeRate: pay.overtimeRate.toFixed(2),
    overtimePay: pay.overtimePay.toFixed(2),
    premiumHours: totals.premium.toFixed(2),
    premiumPay: pay.premiumPay.toFixed(2),
    nightHours: totals.night.toFixed(2),
    nightPay: pay.nightPay.toFixed(2),
    shiftAllowances: shiftAllowances.toFixed(2),
    drivingHours: totals.driving.toFixed(2),
    waitingHours: totals.waiting.toFixed(2),
    breakHours: totals.breaks.toFixed(2),
    hourlyRate: pay.hourlyRate.toFixed(2),
  };

  return prisma.$transaction(async (tx) => {
    const sheet = await tx.timesheet.upsert({
      where: { employeeId_period: { employeeId, period } },
      update: { status: "OPEN", ...figures, updatedById: createdById ?? null },
      create: { dataAreaId, employeeId, period, ...figures, createdById: createdById ?? null },
    });
    // Attach this period's entries to the sheet (locks them once submitted/approved).
    await tx.timeEntry.updateMany({
      where: { dataAreaId, employeeId, workDate: { gte: start, lt: end } },
      data: { timesheetId: sheet.id },
    });
    return tx.timesheet.findUniqueOrThrow({ where: { id: sheet.id }, include: { entries: { orderBy: { workDate: "asc" } } } });
  });
}

/** OPEN → SUBMITTED. */
export async function submitTimesheet(dataAreaId: string, timesheetId: string, userId?: string | null) {
  const sheet = await prisma.timesheet.findFirst({ where: { id: timesheetId, dataAreaId } });
  if (!sheet) throw new AuthError("Timesheet not found", 404);
  if (sheet.status !== "OPEN") throw new AuthError(`Cannot submit a ${sheet.status} timesheet`, 409);
  return prisma.timesheet.update({ where: { id: sheet.id }, data: { status: "SUBMITTED", updatedById: userId ?? null } });
}

/** SUBMITTED → APPROVED | REJECTED. Approved timesheets feed payroll. */
export async function reviewTimesheet(dataAreaId: string, timesheetId: string, approve: boolean, reviewerId?: string | null) {
  const sheet = await prisma.timesheet.findFirst({ where: { id: timesheetId, dataAreaId } });
  if (!sheet) throw new AuthError("Timesheet not found", 404);
  if (sheet.status !== "SUBMITTED") throw new AuthError(`Cannot review a ${sheet.status} timesheet`, 409);
  return prisma.timesheet.update({
    where: { id: sheet.id },
    data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: reviewerId ?? null, reviewedAt: new Date() },
  });
}

export interface TimeEarnings {
  overtimePay: Prisma.Decimal;
  premiumPay: Prisma.Decimal;
  nightPay: Prisma.Decimal;
  shiftAllowances: Prisma.Decimal;
}

/**
 * Approved time-based earnings for a company in a period, keyed by employee.
 * Payroll adds each as its own taxable line, so a payslip shows overtime,
 * rest-day premium, night premium and shift allowances separately.
 */
export async function approvedTimeEarningsByEmployee(dataAreaId: string, period: string): Promise<Map<string, TimeEarnings>> {
  const sheets = await prisma.timesheet.findMany({
    where: { dataAreaId, period, status: "APPROVED" },
    select: { employeeId: true, overtimePay: true, premiumPay: true, nightPay: true, shiftAllowances: true },
  });
  const map = new Map<string, TimeEarnings>();
  for (const s of sheets) {
    map.set(s.employeeId, { overtimePay: D(s.overtimePay), premiumPay: D(s.premiumPay), nightPay: D(s.nightPay), shiftAllowances: D(s.shiftAllowances) });
  }
  return map;
}
