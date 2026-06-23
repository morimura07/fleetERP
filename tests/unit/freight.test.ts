import { describe, it, expect } from "vitest";
import { tripPnL } from "@/lib/services/freight";

describe("tripPnL", () => {
  it("computes profit as revenue minus expenses", () => {
    const r = tripPnL("1000.00", "0", [
      { type: "FUEL", amount: "300.00" },
      { type: "TOLLS", amount: "100.00" },
    ]);
    expect(r.revenue.toString()).toBe("1000");
    expect(r.expenses.toString()).toBe("400");
    expect(r.profit.toString()).toBe("600");
    expect(r.marginPct.toFixed(2)).toBe("60.00");
  });

  it("includes demurrage in revenue", () => {
    const r = tripPnL("1000.00", "250.00", [{ type: "FUEL", amount: "250.00" }]);
    expect(r.revenue.toString()).toBe("1250");
    expect(r.profit.toString()).toBe("1000");
  });

  it("reports a loss as negative profit", () => {
    const r = tripPnL("500.00", "0", [{ type: "FUEL", amount: "800.00" }]);
    expect(r.profit.toString()).toBe("-300");
    expect(r.marginPct.toFixed(2)).toBe("-60.00");
  });

  it("returns 0 margin when there is no revenue", () => {
    const r = tripPnL("0", "0", [{ type: "FUEL", amount: "100.00" }]);
    expect(r.marginPct.toString()).toBe("0");
    expect(r.profit.toString()).toBe("-100");
  });

  it("aggregates expenses by type", () => {
    const r = tripPnL("1000", "0", [
      { type: "FUEL", amount: "100" },
      { type: "FUEL", amount: "150" },
      { type: "TOLLS", amount: "50" },
    ]);
    expect(r.expenseByType.FUEL).toBe("250");
    expect(r.expenseByType.TOLLS).toBe("50");
  });

  it("handles decimal precision without float drift", () => {
    const r = tripPnL("0.30", "0", [
      { type: "FUEL", amount: "0.10" },
      { type: "TOLLS", amount: "0.20" },
    ]);
    expect(r.profit.toString()).toBe("0");
  });
});
