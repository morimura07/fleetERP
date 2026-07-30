import { describe, it, expect } from "vitest";
import { periodKey, periodLabel } from "@backend/services/fiscal-periods";

describe("fiscal period key (M34)", () => {
  it("derives year and 1-based month from a date", () => {
    expect(periodKey(new Date(2026, 6, 15))).toEqual({ year: 2026, month: 7 }); // month index 6 = July
    expect(periodKey(new Date(2026, 0, 1))).toEqual({ year: 2026, month: 1 });
    expect(periodKey(new Date(2026, 11, 31))).toEqual({ year: 2026, month: 12 });
  });

  it("maps the last day of a month to that month, not the next", () => {
    expect(periodKey(new Date(2026, 1, 28))).toEqual({ year: 2026, month: 2 });
    expect(periodKey(new Date(2026, 6, 31, 23, 59))).toEqual({ year: 2026, month: 7 });
  });

  it("labels a period as zero-padded YYYY-MM", () => {
    expect(periodLabel(2026, 7)).toBe("2026-07");
    expect(periodLabel(2026, 12)).toBe("2026-12");
    expect(periodLabel(2027, 1)).toBe("2027-01");
  });
});
