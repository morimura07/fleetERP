import { describe, it, expect } from "vitest";
import { periodRange, planActualLine, summarizePlanVsActual } from "@backend/services/planning";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("period to date range", () => {
  it("covers a whole month as a half-open range", () => {
    const r = periodRange("2026-08")!;
    expect(iso(r.start)).toBe("2026-08-01");
    expect(iso(r.end)).toBe("2026-09-01"); // exclusive, so 31 Aug 23:59 is included
  });

  it("handles February in a leap year and a normal year", () => {
    expect(iso(periodRange("2028-02")!.end)).toBe("2028-03-01");
    expect(iso(periodRange("2026-02")!.end)).toBe("2026-03-01");
  });

  it("rolls December into the next year", () => {
    const r = periodRange("2026-12")!;
    expect(iso(r.start)).toBe("2026-12-01");
    expect(iso(r.end)).toBe("2027-01-01");
  });

  it("resolves an ISO week to its Monday", () => {
    // 2026-01-04 is a Sunday, so ISO week 1 of 2026 starts Monday 29 Dec 2025.
    const w1 = periodRange("2026-W01")!;
    expect(iso(w1.start)).toBe("2025-12-29");
    expect(iso(w1.end)).toBe("2026-01-05");

    const w32 = periodRange("2026-W32")!;
    expect(new Date(w32.start).getUTCDay()).toBe(1); // Monday
    expect(w32.end.getTime() - w32.start.getTime()).toBe(7 * 86_400_000);
  });

  it("rejects malformed periods rather than guessing a range", () => {
    // "2026" was on this list until the planning screen gained an annual
    // horizon (client requirements, Sept 2026); a bare year is now a real
    // period and is covered in fleet-capacity.test.ts.
    for (const bad of ["2026-13", "26-08", "2026-W00", "2026-W54", "August", ""]) {
      expect(periodRange(bad), bad).toBeNull();
    }
  });

  it("reads a bare year as the whole year", () => {
    const y = periodRange("2026")!;
    expect(y.start.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(y.end.toISOString().slice(0, 10)).toBe("2027-01-01");
  });
});

describe("forecast vs actual on one corridor", () => {
  it("reports an under-delivery as a negative variance", () => {
    const l = planActualLine("NORTHERN", 10, 500, 7, 320);
    expect(l.loadVariance).toBe(-3);
    expect(l.loadAchievedPct).toBe(70);
    expect(l.tonneVariance.toString()).toBe("-180");
    expect(l.tonneAchievedPct).toBe(64);
  });

  it("reports an over-delivery as a positive variance", () => {
    const l = planActualLine("CENTRAL", 8, 100, 12, 150);
    expect(l.loadVariance).toBe(4);
    expect(l.loadAchievedPct).toBe(150);
    expect(l.tonneAchievedPct).toBe(150);
  });

  it("shows unplanned work as variance without a misleading percentage", () => {
    // Nothing forecast but 5 loads moved: dividing by zero would be meaningless,
    // so the percentage stays 0 and the variance carries the signal.
    const l = planActualLine("DOMESTIC", 0, 0, 5, 40);
    expect(l.loadVariance).toBe(5);
    expect(l.loadAchievedPct).toBe(0);
    expect(l.tonneVariance.toString()).toBe("40");
  });

  it("shows a forecast that delivered nothing", () => {
    const l = planActualLine("NORTHERN", 10, 500, 0, 0);
    expect(l.loadVariance).toBe(-10);
    expect(l.loadAchievedPct).toBe(0);
    expect(l.tonneVariance.toString()).toBe("-500");
  });

  it("keeps tonnage exact rather than drifting through floating point", () => {
    const l = planActualLine("CENTRAL", 3, "10.10", 3, "20.20");
    expect(l.tonneVariance.toString()).toBe("10.1");
  });

  it("rounds percentages to one decimal", () => {
    expect(planActualLine("CENTRAL", 3, 0, 1, 0).loadAchievedPct).toBe(33.3);
  });
});

describe("period summary", () => {
  const lines = [
    planActualLine("NORTHERN", 10, 500, 7, 320),
    planActualLine("CENTRAL", 5, 250, 8, 400),
  ];

  it("totals loads and tonnage across corridors", () => {
    const s = summarizePlanVsActual("2026-08", lines);
    expect(s.totalForecastLoads).toBe(15);
    expect(s.totalActualLoads).toBe(15);
    expect(s.totalForecastTonnes.toString()).toBe("750");
    expect(s.totalActualTonnes.toString()).toBe("720");
  });

  it("computes achievement on the totals, not by averaging the lines", () => {
    const s = summarizePlanVsActual("2026-08", lines);
    // Loads land exactly on plan overall even though both corridors missed it.
    expect(s.loadAchievedPct).toBe(100);
    expect(s.tonneAchievedPct).toBe(96);
  });

  it("returns zeroes for a period with no forecast and no work", () => {
    const s = summarizePlanVsActual("2026-09", []);
    expect(s.totalForecastLoads).toBe(0);
    expect(s.totalActualTonnes.toString()).toBe("0");
    expect(s.loadAchievedPct).toBe(0);
  });
});
