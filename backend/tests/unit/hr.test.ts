import { describe, it, expect } from "vitest";
import { workingDays, remaining, leaveConsumesBalance } from "@backend/services/hr";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("working-days count (weekends excluded)", () => {
  it("single weekday = 1 day", () => {
    expect(workingDays(d("2026-07-07"), d("2026-07-07"))).toBe(1); // Tuesday
  });

  it("a full Mon–Fri week = 5 days", () => {
    // 2026-07-06 is a Monday, 2026-07-10 is a Friday
    expect(workingDays(d("2026-07-06"), d("2026-07-10"))).toBe(5);
  });

  it("a full Mon–Sun week = 5 working days", () => {
    expect(workingDays(d("2026-07-06"), d("2026-07-12"))).toBe(5);
  });

  it("a single Saturday or Sunday = 0 days", () => {
    expect(workingDays(d("2026-07-11"), d("2026-07-11"))).toBe(0); // Saturday
    expect(workingDays(d("2026-07-12"), d("2026-07-12"))).toBe(0); // Sunday
  });

  it("spanning two weeks counts both weeks' weekdays", () => {
    // Mon 6th → Fri 17th: 10 working days (2 weeks)
    expect(workingDays(d("2026-07-06"), d("2026-07-17"))).toBe(10);
  });

  it("a weekend-only range = 0", () => {
    expect(workingDays(d("2026-07-11"), d("2026-07-12"))).toBe(0);
  });

  it("end before start = 0", () => {
    expect(workingDays(d("2026-07-10"), d("2026-07-06"))).toBe(0);
  });
});

describe("remaining leave balance", () => {
  it("is entitled minus taken", () => {
    expect(remaining(21, 5)).toBe(16);
  });

  it("floors at zero (never negative)", () => {
    expect(remaining(10, 15)).toBe(0);
  });

  it("full balance when nothing taken", () => {
    expect(remaining(21, 0)).toBe(21);
  });
});

describe("which leave types draw down a balance", () => {
  it("ANNUAL and SICK consume a balance", () => {
    expect(leaveConsumesBalance("ANNUAL")).toBe(true);
    expect(leaveConsumesBalance("SICK")).toBe(true);
  });

  it("UNPAID and statutory leave do not", () => {
    expect(leaveConsumesBalance("UNPAID")).toBe(false);
    expect(leaveConsumesBalance("MATERNITY")).toBe(false);
    expect(leaveConsumesBalance("COMPASSIONATE")).toBe(false);
  });
});
