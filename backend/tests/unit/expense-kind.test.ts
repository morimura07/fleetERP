import { describe, it, expect } from "vitest";
import {
  checkFuelLine, validateExpenseKind, label, FUEL_RECONCILIATION_TOLERANCE,
} from "@backend/services/expense-kind";

const fuel = {
  kind: "FUEL" as const,
  amount: 1000,
  fuelVolume: 400,
  fuelUnit: "LITRE" as const,
  ratePerUnit: 2.5,
};

describe("fuel reconciliation", () => {
  it("multiplies volume by rate and finds no variance when they agree", () => {
    const r = checkFuelLine(fuel);
    expect(r.expected!.toNumber()).toBe(1000);
    expect(r.variance!.toNumber()).toBe(0);
    expect(r.suspicious).toBe(false);
  });

  it("tolerates the rounding a pump and a printed receipt introduce", () => {
    // 0.5% over: a real fill, not a problem.
    const r = checkFuelLine({ ...fuel, amount: 1005 });
    expect(r.suspicious).toBe(false);
    expect(r.variancePct).toBe(0.5);
  });

  it("flags a claim materially above the fuel that was bought", () => {
    // 10% over on a 1,000 line. This is the case the report exists for.
    const r = checkFuelLine({ ...fuel, amount: 1100 });
    expect(r.suspicious).toBe(true);
    expect(r.variance!.toNumber()).toBe(100);
    expect(r.variancePct).toBe(10);
  });

  it("flags a claim materially below it too", () => {
    // Under-claiming is still a keying error worth catching.
    const r = checkFuelLine({ ...fuel, amount: 900 });
    expect(r.suspicious).toBe(true);
    expect(r.variance!.toNumber()).toBe(-100);
  });

  it("sits exactly on the tolerance without flagging", () => {
    const onTheLine = 1000 * (1 + FUEL_RECONCILIATION_TOLERANCE);
    expect(checkFuelLine({ ...fuel, amount: onTheLine }).suspicious).toBe(false);
  });

  it("says nothing about a line that is not fuel", () => {
    const r = checkFuelLine({ ...fuel, kind: "GENERAL" });
    expect(r.expected).toBeNull();
    expect(r.suspicious).toBe(false);
  });

  it("says nothing when volume or rate is missing", () => {
    expect(checkFuelLine({ ...fuel, fuelVolume: null }).expected).toBeNull();
    expect(checkFuelLine({ ...fuel, ratePerUnit: null }).expected).toBeNull();
  });

  it("says nothing for a zero or negative volume rather than dividing by it", () => {
    expect(checkFuelLine({ ...fuel, fuelVolume: 0 }).suspicious).toBe(false);
    expect(checkFuelLine({ ...fuel, fuelVolume: -5 }).suspicious).toBe(false);
  });

  it("handles fractional litres without drifting", () => {
    const r = checkFuelLine({ amount: 1234.57, kind: "FUEL", fuelVolume: 432.13, ratePerUnit: 2.8569 });
    expect(r.expected!.toNumber()).toBeCloseTo(1234.55, 2);
    expect(r.suspicious).toBe(false);
  });
});

describe("required detail per kind", () => {
  it("insists a fuel line carries a volume and a rate", () => {
    const issues = validateExpenseKind({ kind: "FUEL", amount: 100 });
    expect(issues.map((i) => i.field).sort()).toEqual(["fuelVolume", "ratePerUnit"]);
    expect(issues[0].message).toContain("fuel");
  });

  it("insists a per-diem line says how many days", () => {
    expect(validateExpenseKind({ kind: "PER_DIEM", amount: 100 })[0].field).toBe("travelDays");
  });

  it("insists a subcontracted line names the carrier", () => {
    expect(validateExpenseKind({ kind: "SUBCONTRACT", amount: 100 })[0].field).toBe("carrierVendorId");
  });

  it("asks nothing extra of a general line", () => {
    expect(validateExpenseKind({ kind: "GENERAL", amount: 100 })).toEqual([]);
  });

  it("accepts a complete line of each kind", () => {
    expect(validateExpenseKind(fuel)).toEqual([]);
    expect(validateExpenseKind({ kind: "PER_DIEM", amount: 300, travelDays: 3 })).toEqual([]);
    expect(validateExpenseKind({ kind: "SUBCONTRACT", amount: 900, carrierVendorId: "v1" })).toEqual([]);
    expect(validateExpenseKind({ kind: "TOLL_PERMIT", amount: 40, permitType: "LATRA" })).toEqual([]);
  });
});

describe("detail belonging to another kind", () => {
  it("rejects fuel detail on a toll line", () => {
    // Usually means the type was changed after the fact. Left alone it would
    // corrupt any fuel report that trusts `kind`.
    const issues = validateExpenseKind({ kind: "TOLL_PERMIT", amount: 40, permitType: "LATRA", fuelVolume: 200 });
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("fuelVolume");
    expect(issues[0].message).toContain("fuel");
  });

  it("rejects a carrier on a repair line", () => {
    const issues = validateExpenseKind({ kind: "REPAIR", amount: 500, carrierVendorId: "v1" });
    expect(issues[0].field).toBe("carrierVendorId");
  });

  it("lists every offending field rather than the first", () => {
    const issues = validateExpenseKind({
      kind: "GENERAL", amount: 100, fuelVolume: 10, travelDays: 2, bolReference: "BOL-1",
    });
    expect(issues.map((i) => i.field).sort()).toEqual(["bolReference", "fuelVolume", "travelDays"]);
  });
});

describe("amounts that cannot be right", () => {
  it("refuses to recover more advance than the line is worth", () => {
    const issues = validateExpenseKind({ kind: "PER_DIEM", amount: 100, travelDays: 2, advanceDeducted: 150 });
    expect(issues.some((i) => i.field === "advanceDeducted")).toBe(true);
  });

  it("allows an advance exactly equal to the line", () => {
    const issues = validateExpenseKind({ kind: "PER_DIEM", amount: 100, travelDays: 2, advanceDeducted: 100 });
    expect(issues).toEqual([]);
  });

  it("refuses parts plus labour above the repair total", () => {
    const issues = validateExpenseKind({ kind: "REPAIR", amount: 500, partsCost: 400, labourCost: 200 });
    expect(issues.some((i) => i.field === "partsCost")).toBe(true);
  });

  it("allows parts plus labour below the total, which leaves room for tax", () => {
    expect(validateExpenseKind({ kind: "REPAIR", amount: 500, partsCost: 300, labourCost: 150 })).toEqual([]);
  });

  it("refuses zero travel days", () => {
    const issues = validateExpenseKind({ kind: "PER_DIEM", amount: 100, travelDays: 0 });
    expect(issues.some((i) => i.field === "travelDays")).toBe(true);
  });
});

describe("labels", () => {
  it("reads as English in an error message", () => {
    expect(label("TOLL_PERMIT")).toBe("toll or permit");
    expect(label("SUBCONTRACT")).toBe("subcontracted transport");
    expect(label("GENERAL")).toBe("general");
  });
});
