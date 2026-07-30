import { describe, it, expect } from "vitest";
import { itemVariance, purchasePriceVariance } from "@backend/services/cost-variance";

describe("standard-cost item variance (M13)", () => {
  it("actual above standard is an unfavorable (positive) variance", () => {
    const v = itemVariance({ standardCost: 10, avgCost: 12, quantityOnHand: 100 });
    expect(v.unitVariance.toFixed(2)).toBe("2.00"); // 12 − 10
    expect(v.variancePct.toFixed(1)).toBe("20.0"); // 2/10
    expect(v.onHandStandard.toFixed(2)).toBe("1000.00"); // 100 × 10
    expect(v.onHandActual.toFixed(2)).toBe("1200.00"); // 100 × 12
    expect(v.varianceValue.toFixed(2)).toBe("200.00"); // unfavorable
  });

  it("actual below standard is a favorable (negative) variance", () => {
    const v = itemVariance({ standardCost: 10, avgCost: 8, quantityOnHand: 50 });
    expect(v.unitVariance.toFixed(2)).toBe("-2.00");
    expect(v.variancePct.toFixed(1)).toBe("-20.0");
    expect(v.varianceValue.toFixed(2)).toBe("-100.00"); // favorable — costs less than standard
  });

  it("is zero when actual equals standard", () => {
    const v = itemVariance({ standardCost: 5, avgCost: 5, quantityOnHand: 200 });
    expect(v.varianceValue.toFixed(2)).toBe("0.00");
    expect(v.variancePct.toFixed(1)).toBe("0.0");
  });

  it("percentage is 0 when there is no standard (avoids divide-by-zero)", () => {
    const v = itemVariance({ standardCost: 0, avgCost: 7, quantityOnHand: 10 });
    expect(v.variancePct.toFixed(1)).toBe("0.0");
  });

  it("handles fractional decimal costs/quantities", () => {
    const v = itemVariance({ standardCost: "1.8000", avgCost: "2.0500", quantityOnHand: "12.5" });
    expect(v.unitVariance.toFixed(4)).toBe("0.2500");
    expect(v.varianceValue.toFixed(2)).toBe("3.13"); // 12.5 × 0.25 = 3.125 → 3.13
  });
});

describe("realized purchase price variance (M13)", () => {
  it("sums (unit cost − standard) × qty over receipts with a standard", () => {
    const ppv = purchasePriceVariance([
      { unitCost: 12, quantity: 10, standardCost: 10 }, // +20
      { unitCost: 9, quantity: 5, standardCost: 10 },   // −5
    ]);
    expect(ppv.toFixed(2)).toBe("15.00");
  });

  it("skips receipts whose item has no standard cost", () => {
    const ppv = purchasePriceVariance([
      { unitCost: 12, quantity: 10, standardCost: null },
      { unitCost: 12, quantity: 10, standardCost: 0 },
      { unitCost: 12, quantity: 10, standardCost: 10 }, // +20 (only this counts)
    ]);
    expect(ppv.toFixed(2)).toBe("20.00");
  });

  it("is zero for no receipts", () => {
    expect(purchasePriceVariance([]).toFixed(2)).toBe("0.00");
  });
});
