import { describe, it, expect } from "vitest";
import { rollupCost, laborAmount } from "@backend/services/service-orders";

describe("service order labor amount", () => {
  it("is hours × rate", () => {
    expect(laborAmount(3, 25).toFixed(2)).toBe("75.00");
  });

  it("handles fractional hours", () => {
    expect(laborAmount(2.5, 40).toFixed(2)).toBe("100.00");
    expect(laborAmount(1.25, 33.33).toFixed(2)).toBe("41.66");
  });

  it("is zero when rate is zero (internal labor tracked at no cost)", () => {
    expect(laborAmount(5, 0).toFixed(2)).toBe("0.00");
  });
});

describe("service order cost rollup", () => {
  it("sums parts and labor into a total", () => {
    const r = rollupCost(
      [{ totalCost: "120.00" }, { totalCost: "45.50" }],
      [{ amount: "75.00" }, { amount: "30.00" }],
    );
    expect(r.partsCost.toFixed(2)).toBe("165.50");
    expect(r.laborCost.toFixed(2)).toBe("105.00");
    expect(r.totalCost.toFixed(2)).toBe("270.50");
  });

  it("is zero across the board for an empty order", () => {
    const r = rollupCost([], []);
    expect(r.partsCost.toFixed(2)).toBe("0.00");
    expect(r.laborCost.toFixed(2)).toBe("0.00");
    expect(r.totalCost.toFixed(2)).toBe("0.00");
  });

  it("handles a parts-only order (internal labor at zero)", () => {
    const r = rollupCost([{ totalCost: "200.00" }], []);
    expect(r.partsCost.toFixed(2)).toBe("200.00");
    expect(r.laborCost.toFixed(2)).toBe("0.00");
    expect(r.totalCost.toFixed(2)).toBe("200.00");
  });

  it("handles a labor-only order (no parts)", () => {
    const r = rollupCost([], [{ amount: "150.00" }]);
    expect(r.partsCost.toFixed(2)).toBe("0.00");
    expect(r.totalCost.toFixed(2)).toBe("150.00");
  });

  it("total always equals partsCost + laborCost (posting invariant)", () => {
    const cases = [
      { p: [{ totalCost: "10.01" }, { totalCost: "0.99" }], l: [{ amount: "5.00" }] },
      { p: [{ totalCost: "999.99" }], l: [{ amount: "0.01" }] },
    ];
    for (const { p, l } of cases) {
      const r = rollupCost(p, l);
      expect(r.partsCost.plus(r.laborCost).toFixed(2)).toBe(r.totalCost.toFixed(2));
    }
  });
});
