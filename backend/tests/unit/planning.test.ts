import { describe, it, expect } from "vitest";
import { capacityLine, summarizePlan, canTransition, FORECAST_TRANSITIONS } from "@backend/services/planning";

describe("capacity line", () => {
  it("flags a shortfall when demand exceeds capacity", () => {
    const l = capacityLine("NORTHERN", 30, 600, 20);
    expect(l.shortfall).toBe(10);
    expect(l.surplus).toBe(0);
    expect(l.utilizationPct).toBe(150); // 30/20
  });
  it("flags a surplus when capacity exceeds demand", () => {
    const l = capacityLine("CENTRAL", 8, 100, 20);
    expect(l.shortfall).toBe(0);
    expect(l.surplus).toBe(12);
    expect(l.utilizationPct).toBe(40); // 8/20
  });
  it("utilization is 0 when there is no capacity", () => {
    const l = capacityLine("DOMESTIC", 5, 50, 0);
    expect(l.utilizationPct).toBe(0);
    expect(l.shortfall).toBe(5);
  });
  it("rounds utilization to 1 decimal", () => {
    const l = capacityLine("NORTHERN", 1, 10, 3);
    expect(l.utilizationPct).toBe(33.3); // 1/3
  });
  it("carries tonnage through as a decimal", () => {
    const l = capacityLine("CENTRAL", 4, "125.50", 4);
    expect(l.forecastTonnes.toFixed(2)).toBe("125.50");
  });
});

describe("plan summary", () => {
  it("aggregates lines into totals and overall utilization", () => {
    const lines = [
      capacityLine("NORTHERN", 30, 600, 20), // shortfall 10
      capacityLine("CENTRAL", 8, 100, 20),   // surplus 12
    ];
    const plan = summarizePlan("2026-08", lines);
    expect(plan.totalForecastLoads).toBe(38);
    expect(plan.totalCapacityLoads).toBe(40);
    expect(plan.totalShortfall).toBe(10); // shortfalls don't net against surplus
    expect(plan.overallUtilizationPct).toBe(95); // 38/40
  });
  it("is empty-safe", () => {
    const plan = summarizePlan("2026-09", []);
    expect(plan.totalForecastLoads).toBe(0);
    expect(plan.totalCapacityLoads).toBe(0);
    expect(plan.overallUtilizationPct).toBe(0);
  });
});

describe("forecast status transitions", () => {
  it("allows DRAFT → CONFIRMED and back", () => {
    expect(canTransition("DRAFT", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "DRAFT")).toBe(true);
  });
  it("allows CONFIRMED → ARCHIVED", () => {
    expect(canTransition("CONFIRMED", "ARCHIVED")).toBe(true);
  });
  it("forbids archiving a draft directly", () => {
    expect(canTransition("DRAFT", "ARCHIVED")).toBe(false);
  });
  it("treats ARCHIVED as terminal", () => {
    expect(FORECAST_TRANSITIONS.ARCHIVED).toEqual([]);
    expect(canTransition("ARCHIVED", "CONFIRMED")).toBe(false);
  });
});
