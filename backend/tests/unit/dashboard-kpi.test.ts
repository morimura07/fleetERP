import { describe, it, expect } from "vitest";
import {
  pct, ratio, onTimeDeliveryPct, avgTransitHours, fillRatePct,
  costPerKm, revenuePerKm, freightCostPerShipment, emptyLoadRatePct,
  fuelEfficiencyKmPerL, maintenanceCostPerKm, breakdownRate,
  driverTurnoverPct, billingAccuracyPct, arRecoveryPct,
} from "@backend/services/dashboard-kpi";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("pct / ratio helpers", () => {
  it("pct is a ÷ b as a 1dp percentage", () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(1, 3)).toBe(33.3);
  });
  it("pct is 0 when the denominator is 0", () => {
    expect(pct(5, 0)).toBe(0);
  });
  it("ratio divides to the given precision, 0 when denom is 0", () => {
    expect(ratio(100, 8, 2)).toBe("12.50");
    expect(ratio(5, 0, 2)).toBe("0.00");
  });
});

describe("on-time delivery %", () => {
  it("counts deliveries on/before ETA, ignoring unmeasured ones", () => {
    const orders = [
      { eta: d("2026-07-10"), actualDelivery: d("2026-07-09") }, // on time
      { eta: d("2026-07-10"), actualDelivery: d("2026-07-10") }, // on time (=)
      { eta: d("2026-07-10"), actualDelivery: d("2026-07-12") }, // late
      { eta: null, actualDelivery: d("2026-07-09") },            // unmeasured
      { eta: d("2026-07-10"), actualDelivery: null },            // unmeasured
    ];
    expect(onTimeDeliveryPct(orders)).toBe(66.7); // 2 of 3 measured
  });
  it("is 0 with no measurable deliveries", () => {
    expect(onTimeDeliveryPct([{ eta: null, actualDelivery: null }])).toBe(0);
  });
});

describe("average transit hours", () => {
  it("means the transit hours", () => {
    expect(avgTransitHours([{ transitHours: "10" }, { transitHours: "20" }])).toBe("15.0");
  });
  it("is 0.0 for no trips", () => {
    expect(avgTransitHours([])).toBe("0.0");
  });
});

describe("fill rate %", () => {
  it("is Σ cargo ÷ Σ capacity", () => {
    expect(fillRatePct([{ cargoKg: "18000", capacityKg: "28000" }])).toBe(64.3);
  });
  it("skips loads with no capacity", () => {
    expect(fillRatePct([{ cargoKg: "5000", capacityKg: "0" }])).toBe(0);
  });
});

describe("cost / revenue per km", () => {
  it("cost per km = cost ÷ distance", () => {
    expect(costPerKm("1450", "1000")).toBe("1.45");
  });
  it("revenue per km = revenue ÷ distance", () => {
    expect(revenuePerKm("9500", "1000")).toBe("9.50");
  });
  it("both are 0.00 with no distance", () => {
    expect(costPerKm("1000", "0")).toBe("0.00");
    expect(revenuePerKm("1000", "0")).toBe("0.00");
  });
});

describe("freight cost per shipment & empty-load rate", () => {
  it("freight cost per shipment = cost ÷ count", () => {
    expect(freightCostPerShipment("3000", 4)).toBe("750.00");
  });
  it("empty-load rate = empty ÷ total", () => {
    expect(emptyLoadRatePct(2, 8)).toBe(25);
    expect(emptyLoadRatePct(0, 0)).toBe(0);
  });
});

describe("fleet KPIs", () => {
  it("fuel efficiency = km ÷ litres", () => {
    expect(fuelEfficiencyKmPerL("1000", "250")).toBe("4.00");
  });
  it("maintenance per km", () => {
    expect(maintenanceCostPerKm("500", "10000")).toBe("0.05");
  });
  it("breakdown rate is events per 10,000 km", () => {
    expect(breakdownRate(3, "15000")).toBe("2.00");
    expect(breakdownRate(1, "0")).toBe("0.00");
  });
});

describe("people & back-office KPIs", () => {
  it("driver turnover %", () => {
    expect(driverTurnoverPct(2, 10)).toBe(20);
  });
  it("billing accuracy is 100% with no invoices", () => {
    expect(billingAccuracyPct(0, 0)).toBe(100);
  });
  it("billing accuracy excludes disputed invoices", () => {
    expect(billingAccuracyPct(1, 4)).toBe(75);
  });
  it("AR recovery = paid ÷ invoiced", () => {
    expect(arRecoveryPct("7500", "10000")).toBe(75);
  });
});
