import { describe, it, expect } from "vitest";
import {
  DEFAULT_POLICY,
  activityConflict,
  currentDutyStatus,
  dutyStatusFor,
  entryBreakdown,
  hourlyRateFor,
  hoursOfService,
  lateMinutes,
  localDateKey,
  localWeekKey,
  localWeekday,
  nightHoursIn,
  parseClock,
  parseRestDays,
  periodTotals,
  pricePeriod,
  scheduleWindow,
  type ActivityLike,
} from "@backend/services/time-engine";

// East Africa Time is UTC+3: "06:00 local" is 03:00Z.
const eat = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+03:00`);
const act = (kind: ActivityLike["kind"], from: Date, to: Date | null): ActivityLike => ({ kind, startedAt: from, endedAt: to });

describe("local calendar", () => {
  it("books an early-morning UTC instant to the right local day", () => {
    // 23:30Z on the 14th is 02:30 on the 15th in Dar es Salaam.
    expect(localDateKey(new Date("2026-09-14T23:30:00Z"))).toBe("2026-09-15");
  });

  it("knows the weekday in local time", () => {
    expect(localWeekday(eat("2026-09-13", "10:00"))).toBe("SUN");
    expect(localWeekday(eat("2026-09-14", "10:00"))).toBe("MON");
  });

  it("keys weeks by their Monday", () => {
    expect(localWeekKey(eat("2026-09-13", "10:00"))).toBe("2026-09-07"); // Sunday belongs to the week before
    expect(localWeekKey(eat("2026-09-14", "00:30"))).toBe("2026-09-14");
  });

  it("parses clock times and rejects nonsense", () => {
    expect(parseClock("06:30")).toEqual({ h: 6, m: 30 });
    expect(() => parseClock("25:00")).toThrow();
    expect(() => parseClock("6")).toThrow();
  });

  it("parses rest days and rejects nonsense", () => {
    expect([...parseRestDays("SAT, sun")]).toEqual(["SAT", "SUN"]);
    expect(() => parseRestDays("FUNDAY")).toThrow();
  });
});

describe("shift schedule", () => {
  it("places a day shift on its date", () => {
    const w = scheduleWindow("2026-09-14", { startTime: "06:00", endTime: "15:00" });
    expect(w.start.toISOString()).toBe("2026-09-14T03:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-09-14T12:00:00.000Z");
  });

  it("carries a night shift over midnight", () => {
    const w = scheduleWindow("2026-09-14", { startTime: "20:00", endTime: "05:00" });
    expect(w.end.toISOString()).toBe("2026-09-15T02:00:00.000Z");
  });

  it("measures lateness in minutes and never negatively", () => {
    const start = eat("2026-09-14", "06:00");
    expect(lateMinutes(start, eat("2026-09-14", "06:25"))).toBe(25);
    expect(lateMinutes(start, eat("2026-09-14", "05:50"))).toBe(0);
    expect(lateMinutes(null, eat("2026-09-14", "09:00"))).toBe(0);
  });
});

describe("night hours", () => {
  it("counts the part of a shift inside 22:00-06:00", () => {
    // 18:00 to 02:00 local: 22:00 to 02:00 is four hours of night.
    expect(nightHoursIn(eat("2026-09-14", "18:00"), eat("2026-09-15", "02:00"), DEFAULT_POLICY)).toBe(4);
  });

  it("sees a window that began the previous evening", () => {
    // 03:00 to 08:00: 03:00 to 06:00 is three hours.
    expect(nightHoursIn(eat("2026-09-15", "03:00"), eat("2026-09-15", "08:00"), DEFAULT_POLICY)).toBe(3);
  });

  it("is zero for a day shift", () => {
    expect(nightHoursIn(eat("2026-09-14", "08:00"), eat("2026-09-14", "17:00"), DEFAULT_POLICY)).toBe(0);
  });

  it("counts a whole night shift", () => {
    // 20:00 to 06:00: eight hours of night.
    expect(nightHoursIn(eat("2026-09-14", "20:00"), eat("2026-09-15", "06:00"), DEFAULT_POLICY)).toBe(8);
  });
});

describe("one shift, split by hand", () => {
  // Monday 06:00 to 18:00 with a one-hour lunch break: 12 h span, 11 h worked,
  // 9 regular, 2 overtime. Driving 6 h, waiting 2 h at the border.
  const clockIn = eat("2026-09-14", "06:00");
  const clockOut = eat("2026-09-14", "18:00");
  const shift = entryBreakdown(
    {
      clockIn, clockOut,
      activities: [
        act("INSPECTION", clockIn, eat("2026-09-14", "06:30")),
        act("DRIVING", eat("2026-09-14", "06:30"), eat("2026-09-14", "10:30")),
        act("WAITING", eat("2026-09-14", "10:30"), eat("2026-09-14", "12:30")),
        act("BREAK", eat("2026-09-14", "12:30"), eat("2026-09-14", "13:30")),
        act("DRIVING", eat("2026-09-14", "13:30"), eat("2026-09-14", "15:30")),
        act("UNLOADING", eat("2026-09-14", "15:30"), clockOut),
      ],
    },
    DEFAULT_POLICY,
  );

  it("takes the break off paid time", () => {
    expect(shift.span).toBe(12);
    expect(shift.breaks).toBe(1);
    expect(shift.worked).toBe(11);
  });

  it("splits at the daily standard", () => {
    expect(shift.regular).toBe(9);
    expect(shift.overtime).toBe(2);
    expect(shift.premium).toBe(0);
  });

  it("totals driving and waiting for detention and HOS", () => {
    expect(shift.driving).toBe(6);
    expect(shift.waiting).toBe(2);
  });

  it("books the shift to Monday", () => {
    expect(shift.dateKey).toBe("2026-09-14");
    expect(shift.restDay).toBe(false);
  });
});

describe("rest days and holidays", () => {
  it("makes every worked hour on a Sunday premium", () => {
    const s = entryBreakdown({ clockIn: eat("2026-09-13", "08:00"), clockOut: eat("2026-09-13", "14:00"), activities: [] }, DEFAULT_POLICY);
    expect(s.restDay).toBe(true);
    expect(s.premium).toBe(6);
    expect(s.regular).toBe(0);
    expect(s.overtime).toBe(0);
  });

  it("treats a public holiday the same way", () => {
    const s = entryBreakdown(
      { clockIn: eat("2026-12-09", "08:00"), clockOut: eat("2026-12-09", "12:00"), activities: [] }, // Independence Day, a Wednesday
      DEFAULT_POLICY,
      (d) => d === "2026-12-09",
    );
    expect(s.premium).toBe(4);
  });

  it("honours a two-day weekend when the policy says so", () => {
    const s = entryBreakdown({ clockIn: eat("2026-09-12", "08:00"), clockOut: eat("2026-09-12", "12:00"), activities: [] }, { ...DEFAULT_POLICY, restDays: "SAT,SUN" });
    expect(s.premium).toBe(4);
  });

  it("keeps a night shift that crosses into Sunday on Saturday's rules", () => {
    const s = entryBreakdown({ clockIn: eat("2026-09-12", "20:00"), clockOut: eat("2026-09-13", "05:00"), activities: [] }, DEFAULT_POLICY);
    expect(s.dateKey).toBe("2026-09-12");
    expect(s.restDay).toBe(false);
    expect(s.regular).toBe(9);
    expect(s.night).toBe(7); // 22:00 to 05:00
  });

  it("does not pay night premium for a break taken at night", () => {
    const s = entryBreakdown(
      {
        clockIn: eat("2026-09-14", "20:00"), clockOut: eat("2026-09-15", "06:00"),
        activities: [act("BREAK", eat("2026-09-15", "00:00"), eat("2026-09-15", "01:00"))],
      },
      DEFAULT_POLICY,
    );
    expect(s.worked).toBe(9);
    expect(s.night).toBe(7); // 8 night hours less the 1 h break
  });
});

describe("a week of shifts", () => {
  const nine = (ymd: string) => entryBreakdown({ clockIn: eat(ymd, "06:00"), clockOut: eat(ymd, "15:00"), activities: [] }, DEFAULT_POLICY);

  it("moves regular hours beyond 45 in a week to overtime", () => {
    // Six 9-hour days Monday to Saturday: 54 regular by the daily rule,
    // 45 regular + 9 overtime by the weekly one.
    const week = ["14", "15", "16", "17", "18", "19"].map((d) => nine(`2026-09-${d}`));
    const t = periodTotals(week, DEFAULT_POLICY);
    expect(t.worked.toNumber()).toBe(54);
    expect(t.regular.toNumber()).toBe(45);
    expect(t.overtime.toNumber()).toBe(9);
    expect(t.shifts).toBe(6);
  });

  it("applies the weekly rule per week, not across the period", () => {
    // Five days one week, five the next: 45 each, no overtime.
    const days = ["14", "15", "16", "17", "18", "21", "22", "23", "24", "25"].map((d) => nine(`2026-09-${d}`));
    const t = periodTotals(days, DEFAULT_POLICY);
    expect(t.regular.toNumber()).toBe(90);
    expect(t.overtime.toNumber()).toBe(0);
  });

  it("adds daily overtime and weekly overtime, never double-counting", () => {
    // Five 10-hour days: daily rule gives 45 regular + 5 overtime; the weekly
    // rule sees 45 regular, exactly at the standard, and adds nothing.
    const days = ["14", "15", "16", "17", "18"].map((d) =>
      entryBreakdown({ clockIn: eat(`2026-09-${d}`, "06:00"), clockOut: eat(`2026-09-${d}`, "16:00"), activities: [] }, DEFAULT_POLICY),
    );
    const t = periodTotals(days, DEFAULT_POLICY);
    expect(t.regular.toNumber()).toBe(45);
    expect(t.overtime.toNumber()).toBe(5);
  });
});

describe("pricing", () => {
  it("derives an hourly rate from basic pay over the standard month", () => {
    // 975,000 / 195 = 5,000 an hour.
    expect(hourlyRateFor({ basicPay: 975_000, grossSalary: 1_200_000 }, DEFAULT_POLICY).toNumber()).toBe(5_000);
  });

  it("prefers a stated hourly rate", () => {
    expect(hourlyRateFor({ hourlyRate: 6_000, basicPay: 975_000, grossSalary: 1_200_000 }, DEFAULT_POLICY).toNumber()).toBe(6_000);
  });

  it("falls back to gross salary for an employee recorded before basic pay existed", () => {
    expect(hourlyRateFor({ grossSalary: 1_950_000 }, DEFAULT_POLICY).toNumber()).toBe(10_000);
  });

  it("prices overtime, premium and night hours by hand", () => {
    // 5,000/h. 9 h overtime at 1.5 = 67,500. 6 h Sunday at 2 = 60,000.
    // 8 night hours at 5% of 5,000 = 2,000.
    const totals = periodTotals(
      [
        ...["14", "15", "16", "17", "18", "19"].map((d) =>
          entryBreakdown({ clockIn: eat(`2026-09-${d}`, "06:00"), clockOut: eat(`2026-09-${d}`, "15:00"), activities: [] }, DEFAULT_POLICY)),
        entryBreakdown({ clockIn: eat("2026-09-20", "08:00"), clockOut: eat("2026-09-20", "14:00"), activities: [] }, DEFAULT_POLICY),
        entryBreakdown({ clockIn: eat("2026-09-21", "20:00"), clockOut: eat("2026-09-22", "06:00"), activities: [] }, DEFAULT_POLICY),
      ],
      DEFAULT_POLICY,
    );
    const pay = pricePeriod(totals, { hourlyRate: 5_000 }, DEFAULT_POLICY);
    expect(totals.overtime.toNumber()).toBe(10); // 9 weekly + 1 daily on the night shift
    expect(pay.overtimeRate.toNumber()).toBe(7_500);
    expect(pay.overtimePay.toNumber()).toBe(75_000);
    expect(pay.premiumPay.toNumber()).toBe(60_000);
    expect(pay.nightPay.toNumber()).toBe(2_000);
  });

  it("uses a contractual overtime rate when there is one", () => {
    const totals = periodTotals(
      [entryBreakdown({ clockIn: eat("2026-09-14", "06:00"), clockOut: eat("2026-09-14", "17:00"), activities: [] }, DEFAULT_POLICY)],
      DEFAULT_POLICY,
    );
    const pay = pricePeriod(totals, { hourlyRate: 5_000, overtimeRate: 9_000 }, DEFAULT_POLICY);
    expect(pay.overtimePay.toNumber()).toBe(18_000); // 2 h at 9,000
  });
});

describe("duty status", () => {
  it("maps activity kinds to the document's statuses", () => {
    expect(dutyStatusFor("DRIVING")).toBe("ON_DUTY_DRIVING");
    expect(dutyStatusFor("LOADING")).toBe("ON_DUTY_NOT_DRIVING");
    expect(dutyStatusFor("BREAK")).toBe("OFF_DUTY");
    expect(dutyStatusFor("REST")).toBe("SLEEPER_BERTH");
    expect(dutyStatusFor("YARD_MOVE")).toBe("YARD_MOVES");
  });

  it("reads the open activity, and on-duty when there is none", () => {
    const t0 = eat("2026-09-14", "06:00");
    expect(currentDutyStatus({ clockIn: t0, clockOut: null, activities: [] })).toBe("ON_DUTY_NOT_DRIVING");
    expect(currentDutyStatus({ clockIn: t0, clockOut: null, activities: [act("DRIVING", t0, null)] })).toBe("ON_DUTY_DRIVING");
    expect(currentDutyStatus({ clockIn: t0, clockOut: eat("2026-09-14", "15:00"), activities: [] })).toBe("CLOCKED_OUT");
  });
});

describe("hours of service", () => {
  const clockIn = eat("2026-09-14", "06:00");

  it("reports a fresh shift as OK with the full allowance", () => {
    const h = hoursOfService({ now: eat("2026-09-14", "07:00"), current: { clockIn, clockOut: null, activities: [act("DRIVING", clockIn, null)] }, recent: [] }, DEFAULT_POLICY);
    expect(h.status).toBe("OK");
    expect(h.drivingHours).toBe(1);
    expect(h.drivingRemaining).toBe(8);
    expect(h.dutyRemaining).toBe(12);
    expect(h.breakDue).toBe(false);
  });

  it("calls for a break after 4.5 hours of driving", () => {
    const h = hoursOfService({ now: eat("2026-09-14", "10:30"), current: { clockIn, clockOut: null, activities: [act("DRIVING", clockIn, null)] }, recent: [] }, DEFAULT_POLICY);
    expect(h.breakDue).toBe(true);
    expect(h.status).toBe("EXCEEDED");
    expect(h.alerts[0]).toMatch(/Break due/);
  });

  it("resets the break clock after a qualifying break, not a short one", () => {
    const acts = [
      act("DRIVING", clockIn, eat("2026-09-14", "10:00")),
      act("BREAK", eat("2026-09-14", "10:00"), eat("2026-09-14", "10:45")),
      act("DRIVING", eat("2026-09-14", "10:45"), null),
    ];
    const h = hoursOfService({ now: eat("2026-09-14", "12:00"), current: { clockIn, clockOut: null, activities: acts }, recent: [] }, DEFAULT_POLICY);
    expect(h.drivingSinceBreak).toBe(1.25);
    expect(h.breakDue).toBe(false);

    const short = [
      act("DRIVING", clockIn, eat("2026-09-14", "10:00")),
      act("BREAK", eat("2026-09-14", "10:00"), eat("2026-09-14", "10:10")),
      act("DRIVING", eat("2026-09-14", "10:10"), null),
    ];
    const s = hoursOfService({ now: eat("2026-09-14", "12:00"), current: { clockIn, clockOut: null, activities: short }, recent: [] }, DEFAULT_POLICY);
    expect(s.breakDue).toBe(true);
  });

  it("warns within an hour of the driving limit", () => {
    const acts = [
      act("DRIVING", clockIn, eat("2026-09-14", "10:00")),
      act("BREAK", eat("2026-09-14", "10:00"), eat("2026-09-14", "10:30")),
      act("DRIVING", eat("2026-09-14", "10:30"), null),
    ];
    // 4 h + 4.25 h = 8.25 h driving; 0.75 left.
    const h = hoursOfService({ now: eat("2026-09-14", "14:45"), current: { clockIn, clockOut: null, activities: acts }, recent: [] }, DEFAULT_POLICY);
    expect(h.drivingRemaining).toBe(0.75);
    expect(h.status).toBe("WARNING");
  });

  it("does not count breaks as duty", () => {
    const acts = [act("BREAK", eat("2026-09-14", "10:00"), eat("2026-09-14", "11:00"))];
    const h = hoursOfService({ now: eat("2026-09-14", "12:00"), current: { clockIn, clockOut: null, activities: acts }, recent: [] }, DEFAULT_POLICY);
    expect(h.dutyHours).toBe(5);
  });

  it("adds up the rolling week across shifts", () => {
    const recent = ["08", "09", "10", "11", "12", "13"].map((d) => ({
      clockIn: eat(`2026-09-${d}`, "06:00"), clockOut: eat(`2026-09-${d}`, "16:00"), activities: [] as ActivityLike[],
    }));
    // Six 10-hour shifts on the 8th to the 13th, all inside the seven days
    // before the 14th 06:00: exactly the 60-hour weekly limit.
    const h = hoursOfService({ now: eat("2026-09-14", "06:00"), current: null, recent }, DEFAULT_POLICY);
    expect(h.status).toBe("OFF_SHIFT");
    expect(h.weeklyDutyHours).toBe(60);
    expect(h.weeklyRemaining).toBe(0);
    expect(h.alerts).toEqual(["Weekly duty limit reached"]);
  });

  it("clips a shift that straddles the start of the rolling week", () => {
    const recent = [{ clockIn: eat("2026-09-07", "04:00"), clockOut: eat("2026-09-07", "08:00"), activities: [] as ActivityLike[] }];
    // Window opens at the 7th 06:00; only two of the four hours count.
    const h = hoursOfService({ now: eat("2026-09-14", "06:00"), current: null, recent }, DEFAULT_POLICY);
    expect(h.weeklyDutyHours).toBe(2);
  });
});

describe("activity conflicts", () => {
  const entry = { clockIn: eat("2026-09-14", "06:00"), clockOut: null };
  const siblings = [{ id: "a", ...act("DRIVING", eat("2026-09-14", "06:00"), eat("2026-09-14", "10:00")) }];

  it("accepts a task that follows the last one", () => {
    expect(activityConflict(entry, siblings, { startedAt: eat("2026-09-14", "10:00"), endedAt: null })).toBeNull();
  });

  it("rejects a task that overlaps another", () => {
    expect(activityConflict(entry, siblings, { startedAt: eat("2026-09-14", "09:00"), endedAt: null })).toMatch(/Overlaps a DRIVING/);
  });

  it("rejects a second open task", () => {
    const open = [{ id: "b", ...act("WAITING", eat("2026-09-14", "10:00"), null) }];
    expect(activityConflict(entry, open, { startedAt: eat("2026-09-14", "11:00"), endedAt: null })).toMatch(/still in progress/);
  });

  it("rejects a task outside the shift", () => {
    expect(activityConflict(entry, [], { startedAt: eat("2026-09-14", "05:00"), endedAt: null })).toMatch(/before the shift/);
    const closed = { ...entry, clockOut: eat("2026-09-14", "15:00") };
    expect(activityConflict(closed, [], { startedAt: eat("2026-09-14", "14:00"), endedAt: eat("2026-09-14", "16:00") })).toMatch(/past the shift/);
  });

  it("ignores the task being edited when checking overlap", () => {
    expect(activityConflict(entry, siblings, { startedAt: eat("2026-09-14", "06:00"), endedAt: eat("2026-09-14", "11:00") }, "a")).toBeNull();
  });

  it("rejects an end before its start", () => {
    expect(activityConflict(entry, [], { startedAt: eat("2026-09-14", "10:00"), endedAt: eat("2026-09-14", "09:00") })).toMatch(/end must be after/);
  });
});
