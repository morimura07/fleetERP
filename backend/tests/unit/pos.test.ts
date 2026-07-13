import { describe, it, expect } from "vitest";
import { lineTotal, saleTotals } from "@backend/services/pos";

describe("POS line total", () => {
  it("is quantity × unit price", () => {
    expect(lineTotal(3, 25).toFixed(2)).toBe("75.00");
  });
  it("handles fractional quantities (e.g. litres of fuel)", () => {
    expect(lineTotal("12.5", "1.80").toFixed(2)).toBe("22.50");
  });
});

describe("POS sale totals", () => {
  it("subtotal is the Σ of line totals; total adds tax", () => {
    const t = saleTotals([
      { quantity: 2, unitPrice: 50 },  // 100
      { quantity: 1, unitPrice: 30 },  // 30
      { quantity: 4, unitPrice: 5 },   // 20
    ], 15);
    expect(t.subtotal.toFixed(2)).toBe("150.00");
    expect(t.tax.toFixed(2)).toBe("15.00");
    expect(t.total.toFixed(2)).toBe("165.00");
  });
  it("defaults tax to zero", () => {
    const t = saleTotals([{ quantity: 1, unitPrice: 99.99 }]);
    expect(t.tax.toFixed(2)).toBe("0.00");
    expect(t.total.toFixed(2)).toBe("99.99");
  });
  it("is zero for an empty basket", () => {
    const t = saleTotals([]);
    expect(t.subtotal.toFixed(2)).toBe("0.00");
    expect(t.total.toFixed(2)).toBe("0.00");
  });
});
