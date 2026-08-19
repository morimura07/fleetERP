import { describe, it, expect } from "vitest";
import { corridorProfitability } from "@backend/services/cost-accounting";

// Helper to build an order row; trip costs default to a simple expense set.
const order = (
  corridor: "NORTHERN" | "CENTRAL" | "DOMESTIC",
  freight: number,
  demurrage: number,
  trip: { wages: number; tolls: number; misc: number; expenses: number[] } | null,
) => ({
  corridor,
  freightAmount: freight,
  demurrageAmount: demurrage,
  // An order now carries a list of trips; a single-truck order is a one-item list.
  trips: trip ? [{ driverWages: trip.wages, tollPermitCost: trip.tolls, miscExpense: trip.misc, expenses: trip.expenses.map((amount) => ({ amount })) }] : [],
});

describe("per-corridor profitability (M6)", () => {
  it("groups orders by corridor and totals revenue/cost/profit/margin", () => {
    const p = corridorProfitability([
      // NORTHERN: rev 5200, cost 1400 → profit 3800
      order("NORTHERN", 5000, 200, { wages: 800, tolls: 150, misc: 50, expenses: [300, 100] }),
      // CENTRAL: rev 3000, cost 1000 → profit 2000
      order("CENTRAL", 3000, 0, { wages: 600, tolls: 0, misc: 0, expenses: [400] }),
    ]);
    const north = p.rows.find((r) => r.corridor === "NORTHERN")!;
    const central = p.rows.find((r) => r.corridor === "CENTRAL")!;
    expect(north.revenue.toFixed(2)).toBe("5200.00");
    expect(north.cost.toFixed(2)).toBe("1400.00");
    expect(north.profit.toFixed(2)).toBe("3800.00");
    expect(north.marginPct.toFixed(1)).toBe("73.1"); // 3800/5200
    expect(central.profit.toFixed(2)).toBe("2000.00");
  });

  it("sums multiple orders in the same corridor", () => {
    const p = corridorProfitability([
      order("DOMESTIC", 1000, 0, { wages: 200, tolls: 0, misc: 0, expenses: [] }),
      order("DOMESTIC", 1500, 0, { wages: 300, tolls: 0, misc: 0, expenses: [100] }),
    ]);
    expect(p.rows).toHaveLength(1);
    const d = p.rows[0];
    expect(d.corridor).toBe("DOMESTIC");
    expect(d.orderCount).toBe(2);
    expect(d.revenue.toFixed(2)).toBe("2500.00");
    expect(d.cost.toFixed(2)).toBe("600.00"); // 200 + (300+100)
    expect(d.profit.toFixed(2)).toBe("1900.00");
  });

  it("orders that never ran a trip contribute revenue but zero cost", () => {
    const p = corridorProfitability([order("NORTHERN", 4000, 0, null)]);
    expect(p.rows[0].revenue.toFixed(2)).toBe("4000.00");
    expect(p.rows[0].cost.toFixed(2)).toBe("0.00");
    expect(p.rows[0].marginPct.toFixed(1)).toBe("100.0");
  });

  it("ranks corridors by profit descending", () => {
    const p = corridorProfitability([
      order("DOMESTIC", 1000, 0, { wages: 900, tolls: 0, misc: 0, expenses: [] }), // profit 100
      order("NORTHERN", 5000, 0, { wages: 1000, tolls: 0, misc: 0, expenses: [] }), // profit 4000
      order("CENTRAL", 3000, 0, { wages: 500, tolls: 0, misc: 0, expenses: [] }), // profit 2500
    ]);
    expect(p.rows.map((r) => r.corridor)).toEqual(["NORTHERN", "CENTRAL", "DOMESTIC"]);
  });

  it("computes the overall total across all corridors", () => {
    const p = corridorProfitability([
      order("NORTHERN", 5000, 0, { wages: 1000, tolls: 0, misc: 0, expenses: [] }),
      order("CENTRAL", 3000, 0, { wages: 500, tolls: 0, misc: 0, expenses: [] }),
    ]);
    expect(p.total.orderCount).toBe(2);
    expect(p.total.revenue.toFixed(2)).toBe("8000.00");
    expect(p.total.cost.toFixed(2)).toBe("1500.00");
    expect(p.total.profit.toFixed(2)).toBe("6500.00");
    expect(p.total.marginPct.toFixed(1)).toBe("81.3"); // 6500/8000
  });

  it("handles a loss-making corridor (negative profit/margin)", () => {
    const p = corridorProfitability([order("CENTRAL", 1000, 0, { wages: 1500, tolls: 0, misc: 0, expenses: [] })]);
    expect(p.rows[0].profit.toFixed(2)).toBe("-500.00");
    expect(p.rows[0].marginPct.toFixed(1)).toBe("-50.0");
  });

  it("is empty-safe", () => {
    const p = corridorProfitability([]);
    expect(p.rows).toEqual([]);
    expect(p.total.orderCount).toBe(0);
    expect(p.total.revenue.toFixed(2)).toBe("0.00");
    expect(p.total.marginPct.toFixed(1)).toBe("0.0");
  });
});
