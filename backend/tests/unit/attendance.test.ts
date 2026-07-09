import { describe, it, expect } from "vitest";
import { entryHours, splitHours, overtimePay, STANDARD_MONTHLY_HOURS } from "@backend/services/attendance";

const at = (iso: string) => new Date(iso);

describe("entry hours (clock-out − clock-in)", () => {
  it("counts a full 8-hour shift", () => {
    expect(entryHours(at("2026-07-07T08:00:00Z"), at("2026-07-07T16:00:00Z")).toFixed(2)).toBe("8.00");
  });

  it("handles fractional hours", () => {
    expect(entryHours(at("2026-07-07T08:00:00Z"), at("2026-07-07T12:30:00Z")).toFixed(2)).toBe("4.50");
  });

  it("is zero for an open (no clock-out) entry", () => {
    expect(entryHours(at("2026-07-07T08:00:00Z"), null).toFixed(2)).toBe("0.00");
  });

  it("is zero when clock-out is not after clock-in", () => {
    expect(entryHours(at("2026-07-07T08:00:00Z"), at("2026-07-07T08:00:00Z")).toFixed(2)).toBe("0.00");
    expect(entryHours(at("2026-07-07T08:00:00Z"), at("2026-07-07T07:00:00Z")).toFixed(2)).toBe("0.00");
  });

  it("spans midnight for a night shift", () => {
    expect(entryHours(at("2026-07-07T22:00:00Z"), at("2026-07-08T06:00:00Z")).toFixed(2)).toBe("8.00");
  });
});

describe("regular / overtime split (176h monthly threshold)", () => {
  it("all hours are regular below the threshold", () => {
    const r = splitHours(160);
    expect(r.regular.toFixed(2)).toBe("160.00");
    expect(r.overtime.toFixed(2)).toBe("0.00");
  });

  it("exactly at the threshold is all regular, no overtime", () => {
    const r = splitHours(STANDARD_MONTHLY_HOURS);
    expect(r.regular.toFixed(2)).toBe("176.00");
    expect(r.overtime.toFixed(2)).toBe("0.00");
  });

  it("hours above the threshold spill into overtime", () => {
    const r = splitHours(190);
    expect(r.regular.toFixed(2)).toBe("176.00");
    expect(r.overtime.toFixed(2)).toBe("14.00");
  });

  it("respects a custom threshold", () => {
    const r = splitHours(50, 40);
    expect(r.regular.toFixed(2)).toBe("40.00");
    expect(r.overtime.toFixed(2)).toBe("10.00");
  });

  it("regular + overtime always equals the total", () => {
    for (const t of [0, 100, 176, 200, 250.5]) {
      const r = splitHours(t);
      expect(r.regular.plus(r.overtime).toFixed(2)).toBe(t.toFixed(2));
    }
  });
});

describe("overtime pay (hours × rate)", () => {
  it("prices overtime hours at the rate", () => {
    expect(overtimePay(14, 12.5).toFixed(2)).toBe("175.00");
  });

  it("is zero when there is no overtime", () => {
    expect(overtimePay(0, 20).toFixed(2)).toBe("0.00");
  });

  it("is zero at a zero rate", () => {
    expect(overtimePay(14, 0).toFixed(2)).toBe("0.00");
  });
});
