import { Prisma } from "@prisma/client";
import type { ShiftActivityKind } from "@prisma/client";
import { OPERATING_UTC_OFFSET_HOURS } from "@backend/services/operational-kpi";

/**
 * The working-time rules, as pure functions over data.
 *
 * Everything here takes a policy as an argument and touches no database, in
 * the same spirit as the payslip engine: the split of a shift into regular,
 * overtime, premium and night hours, the hours-of-service position of a
 * driver, and the duty status implied by what they are doing. All of it is
 * testable by hand.
 *
 * Local time is East Africa Time throughout, the same offset the dock-event
 * shift filter uses; the policy's clock times (night window, shift codes)
 * are read in that zone.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const two = (v: Prisma.Decimal) => v.toDecimalPlaces(2);
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = OPERATING_UTC_OFFSET_HOURS * HOUR_MS;

// ── Policy ───────────────────────────────────────────────────────────────────

export interface TimePolicyRules {
  standardDailyHours: Prisma.Decimal.Value;
  standardWeeklyHours: Prisma.Decimal.Value;
  overtimeMultiplier: Prisma.Decimal.Value;
  restDayMultiplier: Prisma.Decimal.Value;
  nightPremiumPct: Prisma.Decimal.Value;
  /** Comma-separated MON..SUN. */
  restDays: string;
  nightStart: string;
  nightEnd: string;
  standardMonthlyHours: Prisma.Decimal.Value;
  maxDrivingHoursPerShift: Prisma.Decimal.Value;
  maxDutyHoursPerShift: Prisma.Decimal.Value;
  breakAfterDrivingHours: Prisma.Decimal.Value;
  minBreakMinutes: number;
  maxWeeklyDutyHours: Prisma.Decimal.Value;
  warnBeforeLimitHours: Prisma.Decimal.Value;
}

/**
 * Tanzanian defaults: Employment and Labour Relations Act 2004, s.19-20
 * (45 hours a week, 9 a day, overtime at one and a half, rest days and public
 * holidays at double, night work 5% on top). The driving limits are not
 * Tanzanian law; they are a conservative starting point for the customer to
 * set. The same figures are the column defaults on TimePolicy.
 */
export const DEFAULT_POLICY: TimePolicyRules = {
  standardDailyHours: 9,
  standardWeeklyHours: 45,
  overtimeMultiplier: 1.5,
  restDayMultiplier: 2,
  nightPremiumPct: 5,
  restDays: "SUN",
  nightStart: "22:00",
  nightEnd: "06:00",
  standardMonthlyHours: 195,
  maxDrivingHoursPerShift: 9,
  maxDutyHoursPerShift: 13,
  breakAfterDrivingHours: 4.5,
  minBreakMinutes: 30,
  maxWeeklyDutyHours: 60,
  warnBeforeLimitHours: 1,
};

export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Parse "HH:MM"; throws on anything else so a bad policy fails loudly. */
export function parseClock(hhmm: string): { h: number; m: number } {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) throw new Error(`Not a clock time: "${hhmm}" (expected HH:MM)`);
  return { h: Number(m[1]), m: Number(m[2]) };
}

export function parseRestDays(csv: string): Set<Weekday> {
  const out = new Set<Weekday>();
  for (const raw of csv.split(",")) {
    const d = raw.trim().toUpperCase();
    if (!d) continue;
    if (!(WEEKDAYS as readonly string[]).includes(d)) throw new Error(`Not a weekday: "${raw}"`);
    out.add(d as Weekday);
  }
  return out;
}

// ── Local calendar ───────────────────────────────────────────────────────────

/** Midnight (local) of the local day that contains `at`, as a UTC instant. */
export function localDayStart(at: Date): Date {
  return new Date(Math.floor((at.getTime() + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS);
}

/** "YYYY-MM-DD" of the local day containing `at`. */
export function localDateKey(at: Date): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function localWeekday(at: Date): Weekday {
  return WEEKDAYS[new Date(at.getTime() + OFFSET_MS).getUTCDay()];
}

/** Monday 00:00 local of the week containing `at`, as a "YYYY-MM-DD" key. */
export function localWeekKey(at: Date): string {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  const dow = (shifted.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(shifted.getTime() - dow * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/** The instant a local "YYYY-MM-DD" + "HH:MM" names. */
export function localInstant(dateKey: string, hhmm: string): Date {
  const { h, m } = parseClock(hhmm);
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + h * HOUR_MS + m * 60_000 - OFFSET_MS);
}

/**
 * The planned window for a shift code on a local date. An end at or before
 * the start means the shift crosses midnight.
 */
export function scheduleWindow(dateKey: string, shift: { startTime: string; endTime: string }): { start: Date; end: Date } {
  const start = localInstant(dateKey, shift.startTime);
  let end = localInstant(dateKey, shift.endTime);
  if (end <= start) end = new Date(end.getTime() + DAY_MS);
  return { start, end };
}

/** Minutes late, never negative. Zero when there was no schedule. */
export function lateMinutes(scheduledStart: Date | null | undefined, clockIn: Date): number {
  if (!scheduledStart) return 0;
  return Math.max(0, Math.round((clockIn.getTime() - scheduledStart.getTime()) / 60_000));
}

// ── Hours arithmetic ─────────────────────────────────────────────────────────

export function hoursBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / HOUR_MS);
}

/** Hours the two half-open ranges share. */
export function overlapHours(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const s = Math.max(aStart.getTime(), bStart.getTime());
  const e = Math.min(aEnd.getTime(), bEnd.getTime());
  return e > s ? (e - s) / HOUR_MS : 0;
}

/**
 * Hours of [from, to) that fall inside the policy's night window. The window
 * usually crosses midnight (22:00 to 06:00), so every local day the range
 * touches contributes one window starting that evening.
 */
export function nightHoursIn(from: Date, to: Date, policy: Pick<TimePolicyRules, "nightStart" | "nightEnd">): number {
  if (to <= from) return 0;
  let total = 0;
  // Start one day early so a window that began the previous evening is seen.
  for (let day = localDayStart(from).getTime() - DAY_MS; day < to.getTime(); day += DAY_MS) {
    const key = localDateKey(new Date(day));
    const w = scheduleWindow(key, { startTime: policy.nightStart, endTime: policy.nightEnd });
    total += overlapHours(from, to, w.start, w.end);
  }
  return total;
}

// ── Duty status ──────────────────────────────────────────────────────────────

export const DUTY_STATUSES = ["ON_DUTY_DRIVING", "ON_DUTY_NOT_DRIVING", "OFF_DUTY", "SLEEPER_BERTH", "YARD_MOVES"] as const;
export type DutyStatus = (typeof DUTY_STATUSES)[number];

/** Time in these is not paid and not on duty. */
export const UNPAID_KINDS: ReadonlySet<ShiftActivityKind> = new Set(["BREAK", "REST"]);

export function dutyStatusFor(kind: ShiftActivityKind): DutyStatus {
  switch (kind) {
    case "DRIVING": return "ON_DUTY_DRIVING";
    case "BREAK": return "OFF_DUTY";
    case "REST": return "SLEEPER_BERTH";
    case "YARD_MOVE": return "YARD_MOVES";
    default: return "ON_DUTY_NOT_DRIVING";
  }
}

export interface ActivityLike {
  kind: ShiftActivityKind;
  startedAt: Date;
  endedAt: Date | null;
}

export interface EntryLike {
  clockIn: Date;
  clockOut: Date | null;
  activities: ActivityLike[];
}

/** What the person is doing now: the open activity if any, else on duty. */
export function currentDutyStatus(entry: EntryLike): DutyStatus | "CLOCKED_OUT" {
  if (entry.clockOut) return "CLOCKED_OUT";
  const open = entry.activities
    .filter((a) => !a.endedAt)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  return open ? dutyStatusFor(open.kind) : "ON_DUTY_NOT_DRIVING";
}

// ── Splitting one shift ──────────────────────────────────────────────────────

export interface EntryBreakdown {
  /** Local date the shift is booked to: the day it started. */
  dateKey: string;
  weekKey: string;
  /** clockOut - clockIn. */
  span: number;
  /** Span less breaks and rest. */
  worked: number;
  regular: number;
  overtime: number;
  /** Worked hours on a rest day or public holiday. */
  premium: number;
  night: number;
  driving: number;
  waiting: number;
  breaks: number;
  restDay: boolean;
}

const hoursOf = (a: ActivityLike, clip: { from: Date; to: Date }): number =>
  a.endedAt ? overlapHours(a.startedAt, a.endedAt, clip.from, clip.to) : 0;

/** The part of a finished activity that lies inside the shift. */
const clipped = (a: ActivityLike & { endedAt: Date }, clip: { from: Date; to: Date }) => ({
  from: a.startedAt < clip.from ? clip.from : a.startedAt,
  to: a.endedAt > clip.to ? clip.to : a.endedAt,
});

/**
 * Split one completed shift. A shift belongs to the local day it started on,
 * whole; one that runs past midnight into a rest day is not split, which
 * keeps a night shift's pay predictable. Breaks and rest are unpaid and come
 * off before anything else. On a rest day every worked hour is premium and
 * none is regular or overtime; otherwise hours up to the daily standard are
 * regular and the rest overtime. Night hours are counted on top, since the
 * night premium is a percentage added to whatever the hour already earns.
 */
export function entryBreakdown(
  entry: { clockIn: Date; clockOut: Date; activities: ActivityLike[] },
  policy: TimePolicyRules,
  isPublicHoliday: (dateKey: string) => boolean = () => false,
): EntryBreakdown {
  const clip = { from: entry.clockIn, to: entry.clockOut };
  const span = hoursBetween(entry.clockIn, entry.clockOut);
  let breaks = 0;
  let driving = 0;
  let waiting = 0;
  let nightUnpaid = 0;
  for (const a of entry.activities) {
    const h = hoursOf(a, clip);
    if (UNPAID_KINDS.has(a.kind)) {
      breaks += h;
      if (a.endedAt) {
        const c = clipped({ ...a, endedAt: a.endedAt }, clip);
        nightUnpaid += nightHoursIn(c.from, c.to, policy);
      }
    }
    if (a.kind === "DRIVING") driving += h;
    if (a.kind === "WAITING") waiting += h;
  }
  const worked = Math.max(0, span - breaks);

  const dateKey = localDateKey(entry.clockIn);
  const restDay = parseRestDays(policy.restDays).has(localWeekday(entry.clockIn)) || isPublicHoliday(dateKey);
  const daily = D(policy.standardDailyHours).toNumber();
  const regular = restDay ? 0 : Math.min(worked, daily);
  const overtime = restDay ? 0 : worked - regular;
  const premium = restDay ? worked : 0;
  const night = Math.max(0, nightHoursIn(entry.clockIn, entry.clockOut, policy) - nightUnpaid);

  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    dateKey,
    weekKey: localWeekKey(entry.clockIn),
    span: r(span),
    worked: r(worked),
    regular: r(regular),
    overtime: r(overtime),
    premium: r(premium),
    night: r(night),
    driving: r(driving),
    waiting: r(waiting),
    breaks: r(breaks),
    restDay,
  };
}

// ── A period of shifts ───────────────────────────────────────────────────────

export interface PeriodTotals {
  worked: Prisma.Decimal;
  regular: Prisma.Decimal;
  overtime: Prisma.Decimal;
  premium: Prisma.Decimal;
  night: Prisma.Decimal;
  driving: Prisma.Decimal;
  waiting: Prisma.Decimal;
  breaks: Prisma.Decimal;
  shifts: number;
}

/**
 * Sum a period's shifts and apply the weekly rule: within any one local week
 * (Monday to Sunday), regular hours beyond the weekly standard become
 * overtime. The daily rule has already run inside each breakdown, so this
 * only ever moves hours from regular to overtime, never the reverse.
 */
export function periodTotals(shifts: EntryBreakdown[], policy: TimePolicyRules): PeriodTotals {
  const weekly = D(policy.standardWeeklyHours);
  const byWeek = new Map<string, Prisma.Decimal>();
  let worked = D(0), regular = D(0), overtime = D(0), premium = D(0), night = D(0), driving = D(0), waiting = D(0), breaks = D(0);
  for (const s of shifts) {
    worked = worked.plus(s.worked);
    overtime = overtime.plus(s.overtime);
    premium = premium.plus(s.premium);
    night = night.plus(s.night);
    driving = driving.plus(s.driving);
    waiting = waiting.plus(s.waiting);
    breaks = breaks.plus(s.breaks);
    byWeek.set(s.weekKey, (byWeek.get(s.weekKey) ?? D(0)).plus(s.regular));
  }
  for (const weekRegular of byWeek.values()) {
    if (weekRegular.greaterThan(weekly)) {
      overtime = overtime.plus(weekRegular.minus(weekly));
      regular = regular.plus(weekly);
    } else {
      regular = regular.plus(weekRegular);
    }
  }
  return {
    worked: two(worked), regular: two(regular), overtime: two(overtime), premium: two(premium),
    night: two(night), driving: two(driving), waiting: two(waiting), breaks: two(breaks), shifts: shifts.length,
  };
}

// ── Pricing ──────────────────────────────────────────────────────────────────

export interface PayRates {
  hourlyRate: Prisma.Decimal.Value;
  /** A contractual per-hour overtime rate; otherwise hourly x the multiplier. */
  overtimeRate?: Prisma.Decimal.Value | null;
}

export interface PeriodPay {
  hourlyRate: Prisma.Decimal;
  overtimeRate: Prisma.Decimal;
  overtimePay: Prisma.Decimal;
  premiumPay: Prisma.Decimal;
  nightPay: Prisma.Decimal;
}

/**
 * The hourly rate a salaried person is priced at: their stated rate, else
 * basic pay spread over the policy's standard month.
 */
export function hourlyRateFor(
  employee: { hourlyRate?: Prisma.Decimal.Value | null; basicPay?: Prisma.Decimal.Value | null; grossSalary: Prisma.Decimal.Value },
  policy: Pick<TimePolicyRules, "standardMonthlyHours">,
): Prisma.Decimal {
  if (employee.hourlyRate != null && D(employee.hourlyRate).greaterThan(0)) return two(D(employee.hourlyRate));
  const monthly = D(employee.basicPay ?? employee.grossSalary);
  const hours = D(policy.standardMonthlyHours);
  return hours.greaterThan(0) ? two(monthly.dividedBy(hours)) : D(0);
}

export function pricePeriod(totals: PeriodTotals, rates: PayRates, policy: TimePolicyRules): PeriodPay {
  const hourly = D(rates.hourlyRate);
  const overtimeRate = rates.overtimeRate != null && D(rates.overtimeRate).greaterThan(0)
    ? two(D(rates.overtimeRate))
    : two(hourly.times(policy.overtimeMultiplier));
  return {
    hourlyRate: two(hourly),
    overtimeRate,
    overtimePay: two(totals.overtime.times(overtimeRate)),
    premiumPay: two(totals.premium.times(hourly).times(policy.restDayMultiplier)),
    nightPay: two(totals.night.times(hourly).times(policy.nightPremiumPct).dividedBy(100)),
  };
}

// ── Hours of service ─────────────────────────────────────────────────────────

export type FatigueStatus = "OK" | "WARNING" | "EXCEEDED" | "OFF_SHIFT";

export interface HosStatus {
  status: FatigueStatus;
  dutyStatus: DutyStatus | "CLOCKED_OUT";
  /** This shift so far. */
  drivingHours: number;
  dutyHours: number;
  drivingRemaining: number;
  dutyRemaining: number;
  /** Driving since the last qualifying break. */
  drivingSinceBreak: number;
  breakDue: boolean;
  /** Rolling seven days, this shift included. */
  weeklyDutyHours: number;
  weeklyRemaining: number;
  alerts: string[];
}

/**
 * Where a driver stands against the policy right now. Open activities and an
 * open shift are counted up to `now`. Weekly duty is the rolling seven days
 * ending now, across every shift supplied. Pure: the caller loads the
 * shifts.
 */
export function hoursOfService(
  input: { now: Date; current: EntryLike | null; recent: EntryLike[] },
  policy: TimePolicyRules,
): HosStatus {
  const { now, current } = input;
  const r = (n: number) => Math.round(n * 100) / 100;
  const endOf = (a: ActivityLike) => a.endedAt ?? now;

  // Rolling week of duty across every shift, current one included.
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  let weeklyDuty = 0;
  const all = current ? [...input.recent.filter((e) => e !== current), current] : input.recent;
  for (const e of all) {
    const end = e.clockOut ?? now;
    const span = overlapHours(e.clockIn, end, weekStart, now);
    const unpaid = e.activities
      .filter((a) => UNPAID_KINDS.has(a.kind))
      .reduce((s, a) => s + overlapHours(a.startedAt, endOf(a), weekStart, now), 0);
    weeklyDuty += Math.max(0, span - unpaid);
  }

  const maxDriving = D(policy.maxDrivingHoursPerShift).toNumber();
  const maxDuty = D(policy.maxDutyHoursPerShift).toNumber();
  const maxWeekly = D(policy.maxWeeklyDutyHours).toNumber();
  const warn = D(policy.warnBeforeLimitHours).toNumber();
  const weeklyRemaining = Math.max(0, maxWeekly - weeklyDuty);

  if (!current || current.clockOut) {
    return {
      status: "OFF_SHIFT", dutyStatus: "CLOCKED_OUT",
      drivingHours: 0, dutyHours: 0, drivingRemaining: maxDriving, dutyRemaining: maxDuty,
      drivingSinceBreak: 0, breakDue: false,
      weeklyDutyHours: r(weeklyDuty), weeklyRemaining: r(weeklyRemaining),
      alerts: weeklyRemaining <= 0 ? ["Weekly duty limit reached"] : [],
    };
  }

  const acts = [...current.activities].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const driving = acts.filter((a) => a.kind === "DRIVING").reduce((s, a) => s + hoursBetween(a.startedAt, endOf(a)), 0);
  const unpaid = acts.filter((a) => UNPAID_KINDS.has(a.kind)).reduce((s, a) => s + hoursBetween(a.startedAt, endOf(a)), 0);
  const duty = Math.max(0, hoursBetween(current.clockIn, now) - unpaid);

  // Driving since the last break long enough to count.
  const minBreakH = policy.minBreakMinutes / 60;
  const lastBreak = acts
    .filter((a) => UNPAID_KINDS.has(a.kind) && a.endedAt && hoursBetween(a.startedAt, a.endedAt) >= minBreakH)
    .map((a) => a.endedAt!)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const since = lastBreak ?? current.clockIn;
  const drivingSinceBreak = acts
    .filter((a) => a.kind === "DRIVING")
    .reduce((s, a) => s + overlapHours(a.startedAt, endOf(a), since, now), 0);
  const breakDue = drivingSinceBreak >= D(policy.breakAfterDrivingHours).toNumber();

  const drivingRemaining = Math.max(0, maxDriving - driving);
  const dutyRemaining = Math.max(0, maxDuty - duty);

  const alerts: string[] = [];
  if (drivingRemaining <= 0) alerts.push("Driving limit for this shift reached");
  if (dutyRemaining <= 0) alerts.push("Duty limit for this shift reached");
  if (weeklyRemaining <= 0) alerts.push("Weekly duty limit reached");
  if (breakDue) alerts.push(`Break due: ${r(drivingSinceBreak)} h driving since the last break`);
  let status: FatigueStatus = "OK";
  if (alerts.length) status = "EXCEEDED";
  else if (drivingRemaining <= warn || dutyRemaining <= warn || weeklyRemaining <= warn) status = "WARNING";

  return {
    status,
    dutyStatus: currentDutyStatus(current),
    drivingHours: r(driving), dutyHours: r(duty),
    drivingRemaining: r(drivingRemaining), dutyRemaining: r(dutyRemaining),
    drivingSinceBreak: r(drivingSinceBreak), breakDue,
    weeklyDutyHours: r(weeklyDuty), weeklyRemaining: r(weeklyRemaining),
    alerts,
  };
}

// ── Activity validation ──────────────────────────────────────────────────────

/**
 * Whether a new or edited activity fits inside its shift and beside its
 * siblings. Returns the reason it does not, or null. `ignoreId` excludes the
 * activity being edited from the overlap check.
 */
export function activityConflict(
  entry: { clockIn: Date; clockOut: Date | null },
  siblings: (ActivityLike & { id: string })[],
  candidate: { startedAt: Date; endedAt: Date | null },
  ignoreId?: string,
): string | null {
  if (candidate.endedAt && candidate.endedAt <= candidate.startedAt) return "Task end must be after its start";
  if (candidate.startedAt < entry.clockIn) return "Task starts before the shift was clocked in";
  if (entry.clockOut && (candidate.endedAt ?? candidate.startedAt) > entry.clockOut) return "Task runs past the shift's clock-out";
  const cEnd = candidate.endedAt ?? new Date(8.64e15);
  for (const s of siblings) {
    if (s.id === ignoreId) continue;
    if (!s.endedAt && !candidate.endedAt) return `Another task (${s.kind}) is still in progress`;
    const sEnd = s.endedAt ?? new Date(8.64e15);
    if (candidate.startedAt < sEnd && s.startedAt < cEnd) return `Overlaps a ${s.kind} task`;
  }
  return null;
}
