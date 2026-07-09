import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

/**
 * Time & Attendance (M26) — clock-in/out records rolled into monthly timesheets.
 *
 *  • TimeEntry — one shift (clockIn → clockOut). Hours = the elapsed time.
 *  • Timesheet — per employee / period (YYYY-MM). Building it sums the period's
 *    completed entries and splits them into regular vs overtime against a standard
 *    monthly threshold, then prices overtime at the given OT rate.
 *  • An APPROVED timesheet's overtimePay is picked up by Payroll (M9) as a taxable
 *    addition to base salary.
 *
 * The split math (`entryHours`, `splitHours`, `overtimePay`) is pure and unit-tested.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const MS_PER_HOUR = 3_600_000;

/** Standard paid hours in a month before overtime kicks in (≈22 workdays × 8h). */
export const STANDARD_MONTHLY_HOURS = 176;

/** Hours worked in a single entry (clockOut − clockIn), rounded to 2dp. Pure. */
export function entryHours(clockIn: Date, clockOut: Date | null | undefined): Prisma.Decimal {
  if (!clockOut) return D(0);
  const ms = clockOut.getTime() - clockIn.getTime();
  if (ms <= 0) return D(0);
  return D(ms / MS_PER_HOUR).toDecimalPlaces(2);
}

/**
 * Split total hours into regular + overtime against a monthly threshold. Pure.
 * Anything over `threshold` is overtime.
 */
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
  source?: "MANUAL" | "MOBILE" | "BIOMETRIC";
  note?: string | null;
  createdById?: string | null;
}

export async function recordEntry(input: TimeEntryInput) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, dataAreaId: input.dataAreaId },
    select: { id: true },
  });
  if (!employee) throw new AuthError("Employee not found in this company", 404);
  if (input.clockOut && input.clockOut <= input.clockIn) {
    throw new AuthError("Clock-out must be after clock-in", 422);
  }
  return prisma.timeEntry.create({
    data: {
      dataAreaId: input.dataAreaId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      clockIn: input.clockIn,
      clockOut: input.clockOut ?? null,
      source: input.source ?? "MANUAL",
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

/** Close an open entry by setting its clock-out. */
export async function clockOut(dataAreaId: string, entryId: string, at: Date, userId?: string | null) {
  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, dataAreaId } });
  if (!entry) throw new AuthError("Time entry not found", 404);
  if (entry.clockOut) throw new AuthError("Entry is already clocked out", 409);
  if (entry.timesheetId) throw new AuthError("Entry is locked in a timesheet", 409);
  if (at <= entry.clockIn) throw new AuthError("Clock-out must be after clock-in", 422);
  return prisma.timeEntry.update({ where: { id: entry.id }, data: { clockOut: at, updatedById: userId ?? null } });
}

export async function deleteEntry(dataAreaId: string, entryId: string) {
  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, dataAreaId } });
  if (!entry) throw new AuthError("Time entry not found", 404);
  if (entry.timesheetId) throw new AuthError("Cannot delete an entry locked in a timesheet", 409);
  await prisma.timeEntry.delete({ where: { id: entry.id } });
  return { ok: true };
}

// ── Timesheets ────────────────────────────────────────────────────────────────

/**
 * Build (or rebuild) an OPEN timesheet for an employee/period: sum every completed
 * entry in the period, split regular vs overtime, price the overtime, and attach
 * the entries. Idempotent while OPEN. Fails if the timesheet is already submitted.
 */
export async function buildTimesheet(
  dataAreaId: string,
  employeeId: string,
  period: string,
  overtimeRate: Prisma.Decimal.Value,
  createdById?: string | null,
) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, dataAreaId }, select: { id: true } });
  if (!employee) throw new AuthError("Employee not found in this company", 404);
  if (D(overtimeRate).lessThan(0)) throw new AuthError("Overtime rate cannot be negative", 422);

  const { start, end } = periodBounds(period);

  const existing = await prisma.timesheet.findUnique({ where: { employeeId_period: { employeeId, period } } });
  if (existing && existing.status !== "OPEN") throw new AuthError(`Timesheet is already ${existing.status}`, 409);

  // Completed entries in the period (ignore still-open shifts).
  const entries = await prisma.timeEntry.findMany({
    where: { dataAreaId, employeeId, workDate: { gte: start, lt: end }, clockOut: { not: null } },
  });
  const totalHours = entries.reduce((s, e) => s.plus(entryHours(e.clockIn, e.clockOut)), D(0));
  const { regular, overtime } = splitHours(totalHours);
  const otPay = overtimePay(overtime, overtimeRate);

  return prisma.$transaction(async (tx) => {
    const sheet = await tx.timesheet.upsert({
      where: { employeeId_period: { employeeId, period } },
      update: {
        status: "OPEN",
        regularHours: regular.toFixed(2),
        overtimeHours: overtime.toFixed(2),
        overtimeRate: D(overtimeRate).toFixed(2),
        overtimePay: otPay.toFixed(2),
        updatedById: createdById ?? null,
      },
      create: {
        dataAreaId, employeeId, period,
        regularHours: regular.toFixed(2),
        overtimeHours: overtime.toFixed(2),
        overtimeRate: D(overtimeRate).toFixed(2),
        overtimePay: otPay.toFixed(2),
        createdById: createdById ?? null,
      },
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

/**
 * Total approved overtime pay for a company in a period, keyed by employee. Used
 * by Payroll to add overtime to each employee's gross. Returns a Map for O(1) lookup.
 */
export async function approvedOvertimeByEmployee(dataAreaId: string, period: string): Promise<Map<string, Prisma.Decimal>> {
  const sheets = await prisma.timesheet.findMany({
    where: { dataAreaId, period, status: "APPROVED" },
    select: { employeeId: true, overtimePay: true },
  });
  const map = new Map<string, Prisma.Decimal>();
  for (const s of sheets) map.set(s.employeeId, D(s.overtimePay));
  return map;
}
