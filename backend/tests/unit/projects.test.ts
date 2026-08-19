import { describe, it, expect } from "vitest";
import { projectPnL, orderActuals, canTransition, PROJECT_TRANSITIONS } from "@backend/services/projects";

describe("project P&L", () => {
  it("computes budget & actual profit, margin and variances", () => {
    // budget: rev 100k / cost 70k → profit 30k. actual: rev 90k / cost 75k.
    const p = projectPnL(100000, 70000, 90000, 75000);
    expect(p.budgetProfit.toFixed(2)).toBe("30000.00");
    expect(p.actualProfit.toFixed(2)).toBe("15000.00");
    expect(p.marginPct.toFixed(2)).toBe("16.67"); // 15000/90000*100
    expect(p.costVariance.toFixed(2)).toBe("5000.00"); // over budget
    expect(p.revenueVariance.toFixed(2)).toBe("-10000.00"); // under budget
  });

  it("margin is 0 when there is no actual revenue", () => {
    const p = projectPnL(50000, 40000, 0, 12000);
    expect(p.marginPct.toFixed(2)).toBe("0.00");
    expect(p.actualProfit.toFixed(2)).toBe("-12000.00");
  });

  it("a fresh project (no actuals) mirrors the budget as the plan", () => {
    const p = projectPnL(80000, 60000, 0, 0);
    expect(p.budgetProfit.toFixed(2)).toBe("20000.00");
    expect(p.actualProfit.toFixed(2)).toBe("0.00");
    expect(p.costVariance.toFixed(2)).toBe("-60000.00");
  });
});

describe("order actuals rollup", () => {
  it("revenue = freight + demurrage; cost = trip base costs + expenses", () => {
    const a = orderActuals({
      freightAmount: 5000, demurrageAmount: 200,
      trips: [{ driverWages: 800, tollPermitCost: 150, miscExpense: 50, expenses: [{ amount: 300 }, { amount: 100 }] }],
    });
    expect(a.revenue.toFixed(2)).toBe("5200.00");
    expect(a.cost.toFixed(2)).toBe("1400.00"); // 800+150+50+300+100
  });

  it("an order with no trip has revenue but zero cost", () => {
    const a = orderActuals({ freightAmount: 3000, demurrageAmount: 0, trips: [] });
    expect(a.revenue.toFixed(2)).toBe("3000.00");
    expect(a.cost.toFixed(2)).toBe("0.00");
  });

  it("totals the cost of every truck on a multi-vehicle order", () => {
    // A large consignment goes out on several trucks; counting only the first
    // would understate the cost of the order by the rest of the fleet.
    const leg = (wages: number) => ({
      driverWages: wages, tollPermitCost: 100, miscExpense: 25, expenses: [{ amount: 200 }],
    });
    const a = orderActuals({
      freightAmount: 20000, demurrageAmount: 0,
      trips: [leg(800), leg(750), leg(900)],
    });
    expect(a.revenue.toFixed(2)).toBe("20000.00");
    // (800+100+25+200) + (750+100+25+200) + (900+100+25+200)
    expect(a.cost.toFixed(2)).toBe("3425.00");
  });

  it("scales linearly with the number of trucks", () => {
    const leg = { driverWages: 100, tollPermitCost: 0, miscExpense: 0, expenses: [] };
    const one = orderActuals({ freightAmount: 0, demurrageAmount: 0, trips: [leg] });
    const fifteen = orderActuals({ freightAmount: 0, demurrageAmount: 0, trips: Array(15).fill(leg) });
    expect(fifteen.cost.toFixed(2)).toBe(one.cost.times(15).toFixed(2));
  });
});

describe("project status transitions", () => {
  it("allows the normal lifecycle", () => {
    expect(canTransition("PLANNING", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "ON_HOLD")).toBe(true);
    expect(canTransition("ON_HOLD", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "COMPLETED")).toBe(true);
  });
  it("allows cancelling from any live state", () => {
    expect(canTransition("PLANNING", "CANCELLED")).toBe(true);
    expect(canTransition("ACTIVE", "CANCELLED")).toBe(true);
    expect(canTransition("ON_HOLD", "CANCELLED")).toBe(true);
  });
  it("forbids reviving a completed or cancelled project", () => {
    expect(canTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(canTransition("CANCELLED", "PLANNING")).toBe(false);
    expect(PROJECT_TRANSITIONS.COMPLETED).toEqual([]);
    expect(PROJECT_TRANSITIONS.CANCELLED).toEqual([]);
  });
  it("forbids jumping PLANNING straight to COMPLETED", () => {
    expect(canTransition("PLANNING", "COMPLETED")).toBe(false);
  });
});
