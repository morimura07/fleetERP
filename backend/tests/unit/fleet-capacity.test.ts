import { describe, it, expect } from "vitest";
import {
  requiredFleet, fleetLine, summarizeFleetPlan, periodRange, periodDays,
} from "@backend/services/planning";

const base = {
  corridor: "CENTRAL" as const,
  equipmentClass: "FLATBED" as const,
  forecastLoads: 0,
  forecastTonnes: 0,
  turnaroundDays: null as number | null,
  ownFleet: 0,
  maintenanceFleet: 0,
};

describe("period horizons", () => {
  it("resolves a quarter", () => {
    const r = periodRange("2026-Q3")!;
    expect(r.start.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(r.end.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(periodDays("2026-Q3")).toBe(92);
  });

  it("resolves a year, including a leap year", () => {
    expect(periodDays("2026")).toBe(365);
    expect(periodDays("2028")).toBe(366);
  });

  it("still resolves months and ISO weeks", () => {
    expect(periodDays("2026-08")).toBe(31);
    expect(periodDays("2026-02")).toBe(28);
    expect(periodDays("2026-W32")).toBe(7);
  });

  it("refuses a quarter outside 1 to 4", () => {
    expect(periodRange("2026-Q5")).toBeNull();
    expect(periodRange("2026-Q0")).toBeNull();
  });

  it("returns null for a label it does not understand", () => {
    // Guessing would silently measure the wrong dates.
    for (const bad of ["August 2026", "2026-13", "26-08", "", "2026-Q"]) {
      expect(periodRange(bad), bad).toBeNull();
    }
  });
});

describe("required fleet", () => {
  it("divides the period by the turnaround to get trips per truck", () => {
    // 30-day month, 10-day round trip: each truck does 3 loads, so 30 loads
    // need 10 trucks.
    expect(requiredFleet(30, 10, 30)).toBe(10);
  });

  it("rounds up, because a fraction of a truck moves nothing", () => {
    // 31 loads over 3 trips per truck is 10.33 trucks.
    expect(requiredFleet(31, 10, 30)).toBe(11);
  });

  it("scales with corridor length, which is the point", () => {
    // The same 30 loads on a 2-day domestic run versus a 12-day corridor.
    expect(requiredFleet(30, 2, 30)).toBe(2);
    expect(requiredFleet(30, 12, 30)).toBe(12);
  });

  it("handles a turnaround longer than the period", () => {
    // A 45-day round trip inside a 30-day month: every load needs its own truck
    // and then some.
    expect(requiredFleet(4, 45, 30)).toBe(6);
  });

  it("falls back to one truck per load when turnaround is unknown", () => {
    expect(requiredFleet(12, null, 30)).toBe(12);
    expect(requiredFleet(12, 0, 30)).toBe(12);
  });

  it("is zero when there is nothing to move", () => {
    expect(requiredFleet(0, 10, 30)).toBe(0);
    expect(requiredFleet(-5, 10, 30)).toBe(0);
  });

  it("is zero for a period with no days rather than dividing by zero", () => {
    expect(requiredFleet(10, 5, 0)).toBe(0);
  });

  it("accepts a fractional turnaround", () => {
    // A 1.5-day shuttle over 30 days is 20 trips per truck.
    expect(requiredFleet(40, 1.5, 30)).toBe(2);
  });
});

describe("fleet line", () => {
  it("nets the workshop out of the owned fleet", () => {
    const l = fleetLine({ ...base, ownFleet: 20, maintenanceFleet: 6 }, 30);
    expect(l.netOperationalCapacity).toBe(14);
  });

  it("reports a surplus as a positive gap and needs no subcontractors", () => {
    const l = fleetLine({ ...base, forecastLoads: 30, turnaroundDays: 10, ownFleet: 20, maintenanceFleet: 2 }, 30);
    expect(l.requiredFleet).toBe(10);
    expect(l.netOperationalCapacity).toBe(18);
    expect(l.capacityGap).toBe(8);
    expect(l.subcontractRequired).toBe(0);
  });

  it("turns a deficit into the number of trucks to hire in", () => {
    const l = fleetLine({ ...base, forecastLoads: 60, turnaroundDays: 10, ownFleet: 12, maintenanceFleet: 2 }, 30);
    expect(l.requiredFleet).toBe(20);
    expect(l.netOperationalCapacity).toBe(10);
    expect(l.capacityGap).toBe(-10);
    expect(l.subcontractRequired).toBe(10);
  });

  it("measures readiness against dispatchable trucks, not the whole yard", () => {
    // 30 trucks but 20 in the workshop: a job needing 15 is oversubscribed,
    // not comfortably half-used.
    const l = fleetLine({ ...base, forecastLoads: 45, turnaroundDays: 10, ownFleet: 30, maintenanceFleet: 20 }, 30);
    expect(l.requiredFleet).toBe(15);
    expect(l.netOperationalCapacity).toBe(10);
    expect(l.readinessPct).toBe(150);
  });

  it("cannot have more trucks in the workshop than it owns", () => {
    const l = fleetLine({ ...base, ownFleet: 5, maintenanceFleet: 9 }, 30);
    expect(l.maintenanceFleet).toBe(5);
    expect(l.netOperationalCapacity).toBe(0);
  });

  it("flags a line whose turnaround time was never entered", () => {
    const known = fleetLine({ ...base, forecastLoads: 10, turnaroundDays: 5, ownFleet: 4 }, 30);
    const unknown = fleetLine({ ...base, forecastLoads: 10, turnaroundDays: null, ownFleet: 4 }, 30);
    expect(known.turnaroundKnown).toBe(true);
    expect(unknown.turnaroundKnown).toBe(false);
  });

  it("reports zero readiness rather than dividing by an empty fleet", () => {
    const l = fleetLine({ ...base, forecastLoads: 10, turnaroundDays: 5, ownFleet: 0 }, 30);
    expect(l.readinessPct).toBe(0);
    expect(l.subcontractRequired).toBe(2);
  });
});

describe("fleet plan summary", () => {
  const lines = [
    fleetLine({ ...base, corridor: "NORTHERN", forecastLoads: 60, turnaroundDays: 10, ownFleet: 12, maintenanceFleet: 2 }, 30),
    fleetLine({ ...base, corridor: "CENTRAL", forecastLoads: 30, turnaroundDays: 10, ownFleet: 20, maintenanceFleet: 2 }, 30),
  ];

  it("totals the requirement and the subcontracting", () => {
    const p = summarizeFleetPlan("2026-08", 30, lines);
    expect(p.totalRequiredFleet).toBe(30); // 20 + 10
    expect(p.totalNetCapacity).toBe(28); // 10 + 18
    expect(p.totalSubcontractRequired).toBe(10); // only the northern deficit
  });

  it("does not net a surplus on one corridor against a deficit on another", () => {
    // Spare flatbeds in the Central corridor cannot move Northern freight this
    // month; the subcontracting requirement is real.
    const p = summarizeFleetPlan("2026-08", 30, lines);
    expect(p.totalSubcontractRequired).toBeGreaterThan(0);
  });

  it("counts the lines still missing a turnaround time", () => {
    const p = summarizeFleetPlan("2026-08", 30, [
      ...lines,
      fleetLine({ ...base, forecastLoads: 5, turnaroundDays: null, ownFleet: 3 }, 30),
    ]);
    expect(p.linesMissingTurnaround).toBe(1);
  });

  it("ignores an empty forecast when counting missing turnarounds", () => {
    const p = summarizeFleetPlan("2026-08", 30, [
      fleetLine({ ...base, forecastLoads: 0, turnaroundDays: null, ownFleet: 3 }, 30),
    ]);
    expect(p.linesMissingTurnaround).toBe(0);
  });

  it("is empty rather than NaN with no lines at all", () => {
    const p = summarizeFleetPlan("2026-08", 30, []);
    expect(p.totalRequiredFleet).toBe(0);
    expect(p.overallReadinessPct).toBe(0);
  });
});
