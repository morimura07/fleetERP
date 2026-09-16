import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { defineReport } from "@backend/services/report-registry";
import { entryBreakdown, hourlyRateFor, hoursOfService } from "@backend/services/time-engine";
import { policyFor, toRules, publicHolidayKeys } from "@backend/services/time-management";
import { OPERATING_UTC_OFFSET_HOURS } from "@backend/services/operational-kpi";

/**
 * Time management reports (client requirements, Sept 2026, Time Management
 * §5-6): the hours-of-service log that was registered as unavailable until
 * shifts recorded tasks, and the labour cost allocation that maps hours to
 * the trip and client they were worked for.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal.Value) => D(v).toDecimalPlaces(2).toNumber();
const fmt0 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

function dateWindow(field: string, from: Date | null, to: Date | null) {
  return from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
}

// ── Driver duty & hours of service ───────────────────────────────────────────

interface HosRow {
  employee: string;
  date: string;
  shift: string;
  clockIn: string;
  clockOut: string;
  onDutyHours: number;
  drivingHours: number;
  waitingHours: number;
  restHours: number;
  overtimeHours: number;
  drivingLimit: number;
  dutyLimit: number;
  status: string;
  alerts: string;
}

export const driverHosReport = defineReport<HosRow>({
  key: "driver-hos-log",
  title: "Driver duty & hours of service",
  group: "DRIVER",
  description: "Each completed shift against the company's driving and duty limits, with the breaks taken.",
  permission: "attendance:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
  ],
  columns: [
    { header: "Employee", value: (r) => r.employee, width: 18 },
    { header: "Date", value: (r) => r.date, width: 11 },
    { header: "Shift", value: (r) => r.shift, width: 9 },
    { header: "In", value: (r) => r.clockIn, width: 7 },
    { header: "Out", value: (r) => r.clockOut, width: 7 },
    { header: "On duty (h)", value: (r) => r.onDutyHours, width: 10 },
    { header: "Driving (h)", value: (r) => r.drivingHours, width: 10 },
    { header: "Waiting (h)", value: (r) => r.waitingHours, width: 10 },
    { header: "Rest (h)", value: (r) => r.restHours, width: 9 },
    { header: "Overtime (h)", value: (r) => r.overtimeHours, width: 10 },
    { header: "Driving limit", value: (r) => r.drivingLimit, width: 10 },
    { header: "Duty limit", value: (r) => r.dutyLimit, width: 9 },
    { header: "Status", value: (r) => r.status, width: 10 },
    { header: "Alerts", value: (r) => r.alerts, width: 30 },
  ],
  run: async (ctx) => {
    const [policy, entries] = await Promise.all([
      policyFor(ctx.dataAreaId),
      prisma.timeEntry.findMany({
        where: { dataAreaId: ctx.dataAreaId, clockOut: { not: null }, ...dateWindow("workDate", ctx.from, ctx.to) },
        include: {
          employee: { select: { name: true } },
          shiftCode: { select: { code: true } },
          activities: { select: { kind: true, startedAt: true, endedAt: true } },
        },
        orderBy: [{ workDate: "asc" }, { clockIn: "asc" }],
      }),
    ]);
    const rules = toRules(policy);
    const holidays = ctx.from && ctx.to ? await publicHolidayKeys(ctx.dataAreaId, ctx.from, new Date(ctx.to.getTime() + 86_400_000)) : new Set<string>();
    const local = (d: Date) => new Date(d.getTime() + OPERATING_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(11, 16);

    return entries.map((e) => {
      const b = entryBreakdown({ clockIn: e.clockIn, clockOut: e.clockOut!, activities: e.activities }, rules, (k) => holidays.has(k));
      // The position at the moment of clock-out, judged on this shift alone.
      const hos = hoursOfService({ now: e.clockOut!, current: { ...e, clockOut: null }, recent: [] }, rules);
      return {
        employee: e.employee.name,
        date: b.dateKey,
        shift: e.shiftCode?.code ?? "",
        clockIn: local(e.clockIn),
        clockOut: local(e.clockOut!),
        onDutyHours: b.worked,
        drivingHours: b.driving,
        waitingHours: b.waiting,
        restHours: b.breaks,
        overtimeHours: b.overtime,
        drivingLimit: D(rules.maxDrivingHoursPerShift).toNumber(),
        dutyLimit: D(rules.maxDutyHoursPerShift).toNumber(),
        status: hos.status,
        alerts: hos.alerts.join("; "),
      };
    });
  },
  summary: (rows) => [
    { label: "Shifts", value: String(rows.length) },
    { label: "On duty (h)", value: fmt1(rows.reduce((s, r) => s + r.onDutyHours, 0)) },
    { label: "Driving (h)", value: fmt1(rows.reduce((s, r) => s + r.drivingHours, 0)) },
    { label: "Over a limit", value: String(rows.filter((r) => r.status === "EXCEEDED").length), hint: "shifts" },
  ],
});

// ── Labour cost allocation ───────────────────────────────────────────────────

interface LabourRow {
  trip: string;
  client: string;
  route: string;
  shifts: number;
  employees: number;
  workedHours: number;
  drivingHours: number;
  waitingHours: number;
  overtimeHours: number;
  labourCost: number;
}

export const labourCostReport = defineReport<LabourRow>({
  key: "labour-cost-allocation",
  title: "Labour cost by trip & client",
  group: "FINANCE",
  description: "Hours worked on each trip, priced at each person's hourly rate, so freight billing carries the true crew cost.",
  permission: "attendance:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
    { name: "clientId", label: "Client", kind: "client" },
  ],
  columns: [
    { header: "Trip", value: (r) => r.trip, width: 14 },
    { header: "Client", value: (r) => r.client, width: 18 },
    { header: "Route", value: (r) => r.route, width: 22 },
    { header: "Shifts", value: (r) => r.shifts, width: 8 },
    { header: "Crew", value: (r) => r.employees, width: 7 },
    { header: "Worked (h)", value: (r) => r.workedHours, width: 10 },
    { header: "Driving (h)", value: (r) => r.drivingHours, width: 10 },
    { header: "Waiting (h)", value: (r) => r.waitingHours, width: 10 },
    { header: "Overtime (h)", value: (r) => r.overtimeHours, width: 10 },
    { header: "Labour cost", value: (r) => r.labourCost, width: 12 },
  ],
  run: async (ctx) => {
    const [policy, entries] = await Promise.all([
      policyFor(ctx.dataAreaId),
      prisma.timeEntry.findMany({
        where: {
          dataAreaId: ctx.dataAreaId,
          clockOut: { not: null },
          ...dateWindow("workDate", ctx.from, ctx.to),
          ...(ctx.params.clientId ? { trip: { order: { clientId: ctx.params.clientId } } } : {}),
        },
        include: {
          employee: { select: { id: true, hourlyRate: true, basicPay: true, grossSalary: true } },
          activities: { select: { kind: true, startedAt: true, endedAt: true } },
          trip: {
            select: {
              id: true, tripCode: true, originFacility: true, destinationFacility: true,
              order: { select: { originZone: true, destinationZone: true, client: { select: { companyName: true } } } },
            },
          },
        },
      }),
    ]);
    const rules = toRules(policy);
    const holidays = ctx.from && ctx.to ? await publicHolidayKeys(ctx.dataAreaId, ctx.from, new Date(ctx.to.getTime() + 86_400_000)) : new Set<string>();

    const byTrip = new Map<string, LabourRow & { crew: Set<string> }>();
    for (const e of entries) {
      const key = e.trip?.id ?? "(none)";
      const row = byTrip.get(key) ?? {
        trip: e.trip ? e.trip.tripCode : "(no trip)",
        client: e.trip?.order.client?.companyName ?? "",
        route: e.trip ? `${e.trip.originFacility ?? e.trip.order.originZone ?? ""} -> ${e.trip.destinationFacility ?? e.trip.order.destinationZone ?? ""}` : "",
        shifts: 0, employees: 0, workedHours: 0, drivingHours: 0, waitingHours: 0, overtimeHours: 0, labourCost: 0, crew: new Set<string>(),
      };
      const b = entryBreakdown({ clockIn: e.clockIn, clockOut: e.clockOut!, activities: e.activities }, rules, (k) => holidays.has(k));
      const hourly = hourlyRateFor(e.employee, rules);
      // Regular hours at the rate, overtime at the multiple, rest-day hours at
      // the rest-day multiple: what the timesheet would pay for this shift.
      const cost = hourly.times(b.regular)
        .plus(hourly.times(rules.overtimeMultiplier).times(b.overtime))
        .plus(hourly.times(rules.restDayMultiplier).times(b.premium));
      row.shifts += 1;
      row.crew.add(e.employee.id);
      row.workedHours = money(D(row.workedHours).plus(b.worked));
      row.drivingHours = money(D(row.drivingHours).plus(b.driving));
      row.waitingHours = money(D(row.waitingHours).plus(b.waiting));
      row.overtimeHours = money(D(row.overtimeHours).plus(b.overtime));
      row.labourCost = money(D(row.labourCost).plus(cost));
      byTrip.set(key, row);
    }
    return [...byTrip.values()]
      .map(({ crew, ...r }) => ({ ...r, employees: crew.size }))
      .sort((a, b) => b.labourCost - a.labourCost);
  },
  summary: (rows) => [
    { label: "Trips", value: String(rows.filter((r) => r.trip !== "(no trip)").length) },
    { label: "Worked (h)", value: fmt1(rows.reduce((s, r) => s + r.workedHours, 0)) },
    { label: "Waiting (h)", value: fmt1(rows.reduce((s, r) => s + r.waitingHours, 0)), hint: "detention to recover" },
    { label: "Labour cost", value: fmt0(rows.reduce((s, r) => s + r.labourCost, 0)) },
  ],
});

export const timeReports = [driverHosReport, labourCostReport];
