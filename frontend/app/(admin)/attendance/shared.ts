import type { AttendanceSource, DutyStatus, FatigueStatus, ShiftActivityKind, TimesheetStatus } from "@frontend/lib/enums";

/**
 * Types and small helpers shared by the attendance screens. Times are shown
 * in East Africa Time, which is what the backend's shift windows, night
 * window and daily split are computed in; a punch at 06:25 in Dar must read
 * 06:25 whatever the browser's zone.
 */

export const OPERATING_TZ = "Africa/Dar_es_Salaam";

export type EmployeeOpt = { id: string; code: string; name: string; currency: string };
export type ShiftCodeOpt = { id: string; code: string; name: string; startTime: string; endTime: string };
export type VehicleOpt = { id: string; vehicleNumber: string; plateNumber: string };

export interface Lookups {
  employees: EmployeeOpt[];
  shiftCodes: ShiftCodeOpt[];
  vehicles: VehicleOpt[];
}

export interface ActivityRow {
  id: string;
  kind: ShiftActivityKind;
  startedAt: string;
  endedAt: string | null;
  place: string | null;
  note: string | null;
  version: number;
}

export interface EntryRow {
  id: string;
  employeeId: string;
  workDate: string;
  clockIn: string;
  clockOut: string | null;
  hours: string;
  source: AttendanceSource;
  timesheetId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  lateMinutes: number;
  dutyStatus: DutyStatus;
  clockInPlace: string | null;
  clockOutPlace: string | null;
  employee: { code: string; name: string };
  shiftCode: { code: string; name: string } | null;
  vehicle: { vehicleNumber: string } | null;
}

export interface Breakdown {
  span: number; worked: number; regular: number; overtime: number; premium: number;
  night: number; driving: number; waiting: number; breaks: number; restDay: boolean;
}

export interface EntryDetail extends EntryRow {
  activities: ActivityRow[];
  breakdown: Breakdown | null;
  trip: { id: string; originFacility: string | null; destinationFacility: string | null; status: string } | null;
  timesheet: { id: string; period: string; status: TimesheetStatus } | null;
  employee: { code: string; name: string; jobTitle: string | null; driverId: string | null };
}

export interface HosStatus {
  status: FatigueStatus;
  dutyStatus: DutyStatus;
  drivingHours: number;
  dutyHours: number;
  drivingRemaining: number;
  dutyRemaining: number;
  drivingSinceBreak: number;
  breakDue: boolean;
  weeklyDutyHours: number;
  weeklyRemaining: number;
  alerts: string[];
  policyVerified: boolean;
}

export interface SheetRow {
  id: string;
  employeeId: string;
  period: string;
  status: TimesheetStatus;
  regularHours: string; overtimeHours: string; overtimeRate: string; overtimePay: string;
  premiumHours: string; premiumPay: string; nightHours: string; nightPay: string;
  shiftAllowances: string; drivingHours: string; waitingHours: string; breakHours: string; hourlyRate: string;
  employee: { code: string; name: string };
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: OPERATING_TZ });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: OPERATING_TZ });

export const hrs = (v: string | number) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;

export const money = (v: string | number, ccy = "TZS") =>
  `${ccy} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);

/** "YYYY-MM-DDTHH:MM" for a datetime-local input, in the operating zone, now. */
export function nowLocalInput(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: OPERATING_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** A datetime-local value typed in the operating zone, as an ISO instant. */
export function localInputToIso(value: string): string {
  return new Date(`${value}:00+03:00`).toISOString();
}
