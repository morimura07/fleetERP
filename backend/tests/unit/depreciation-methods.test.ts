import { describe, it, expect } from "vitest";
import {
  depreciationForPeriod, unitsNotYetCharged, monthlyDepreciation,
} from "@backend/services/fixed-assets";

/** A 120,000 truck with 20,000 residual over 5 years: 100,000 to depreciate. */
const truck = {
  acquisitionCost: 120_000,
  residualValue: 20_000,
  usefulLifeMonths: 60,
  accumulatedDepreciation: 0,
  depreciationMethod: "STRAIGHT_LINE" as const,
};

describe("straight line is unchanged", () => {
  it("charges the depreciable base evenly over the life", () => {
    expect(depreciationForPeriod(truck).toNumber()).toBe(1666.67);
  });

  it("agrees exactly with the original function", () => {
    for (const accumulated of [0, 25_000, 99_000, 100_000]) {
      const a = { ...truck, accumulatedDepreciation: accumulated };
      expect(depreciationForPeriod(a).toString()).toBe(monthlyDepreciation(a).toString());
    }
  });

  it("charges only the remainder in the final period", () => {
    const a = { ...truck, accumulatedDepreciation: 99_500 };
    expect(depreciationForPeriod(a).toNumber()).toBe(500);
  });

  it("stops at the residual floor", () => {
    const a = { ...truck, accumulatedDepreciation: 100_000 };
    expect(depreciationForPeriod(a).toNumber()).toBe(0);
  });
});

describe("declining balance", () => {
  const db = { ...truck, depreciationMethod: "DECLINING_BALANCE" as const, decliningRatePct: 24 };

  it("charges the annual rate against net book value, monthly", () => {
    // 24% a year on 120,000 is 28,800; a twelfth of that is 2,400.
    expect(depreciationForPeriod(db).toNumber()).toBe(2400);
  });

  it("charges less as the book value falls, which is the point", () => {
    const first = depreciationForPeriod(db);
    const later = depreciationForPeriod({ ...db, accumulatedDepreciation: 60_000 });
    expect(later.lessThan(first)).toBe(true);
    // 24% of the remaining 60,000 book value, over twelve months.
    expect(later.toNumber()).toBe(1200);
  });

  it("never takes book value below residual", () => {
    // 99,900 charged means only 100 of depreciable base is left, far less than
    // the rate would otherwise take.
    const a = { ...db, accumulatedDepreciation: 99_900 };
    expect(depreciationForPeriod(a).toNumber()).toBe(100);
  });

  it("falls back to straight line when no rate was set", () => {
    const a = { ...db, decliningRatePct: null };
    expect(depreciationForPeriod(a).toString()).toBe(monthlyDepreciation(truck).toString());
  });

  it("falls back to straight line for a zero or negative rate", () => {
    for (const rate of [0, -5]) {
      const a = { ...db, decliningRatePct: rate };
      expect(depreciationForPeriod(a).toString()).toBe(monthlyDepreciation(truck).toString());
    }
  });
});

describe("units of production", () => {
  // 500,000 km expected over the life: 0.20 per km of the 100,000 base.
  const uop = {
    ...truck,
    depreciationMethod: "UNITS_OF_PRODUCTION" as const,
    totalExpectedUnits: 500_000,
  };

  it("charges per unit of output", () => {
    expect(depreciationForPeriod(uop, 10_000).toNumber()).toBe(2000);
  });

  it("charges nothing for an idle asset", () => {
    // A truck that did not move this month depreciates nothing under this
    // method, which is the whole reason an operator chooses it.
    expect(depreciationForPeriod(uop, 0).toNumber()).toBe(0);
  });

  it("never exceeds what is left to depreciate", () => {
    // Enough kilometres to more than finish the asset off.
    expect(depreciationForPeriod(uop, 900_000).toNumber()).toBe(100_000);
  });

  it("falls back to straight line with no expected lifetime output", () => {
    const a = { ...uop, totalExpectedUnits: null };
    expect(depreciationForPeriod(a, 10_000).toString()).toBe(monthlyDepreciation(truck).toString());
  });

  it("ignores negative output rather than crediting depreciation back", () => {
    expect(depreciationForPeriod(uop, -5_000).toNumber()).toBe(0);
  });
});

describe("units not yet charged", () => {
  it("is the whole meter when nothing has been depreciated", () => {
    expect(unitsNotYetCharged(40_000, 500_000, 0, 120_000, 20_000).toNumber()).toBe(40_000);
  });

  it("subtracts the output already paid for", () => {
    // 8,000 charged of a 100,000 base is 8% of the life, so 40,000 of the
    // 500,000 expected kilometres have been accounted for.
    expect(unitsNotYetCharged(50_000, 500_000, 8_000, 120_000, 20_000).toNumber()).toBe(10_000);
  });

  it("is zero when the meter has not moved since the last run", () => {
    expect(unitsNotYetCharged(40_000, 500_000, 8_000, 120_000, 20_000).toNumber()).toBe(0);
  });

  it("never goes negative if the meter is corrected downwards", () => {
    // Someone fixed an over-read. That is a correction, not a credit.
    expect(unitsNotYetCharged(30_000, 500_000, 8_000, 120_000, 20_000).toNumber()).toBe(0);
  });

  it("is zero without an expected lifetime output", () => {
    expect(unitsNotYetCharged(40_000, null, 0, 120_000, 20_000).toNumber()).toBe(0);
  });

  it("is zero for an asset with nothing to depreciate", () => {
    expect(unitsNotYetCharged(40_000, 500_000, 0, 20_000, 20_000).toNumber()).toBe(0);
  });
});

describe("shared guards across every method", () => {
  const methods = ["STRAIGHT_LINE", "DECLINING_BALANCE", "UNITS_OF_PRODUCTION"] as const;

  it("charges nothing once the residual is reached", () => {
    for (const m of methods) {
      const a = { ...truck, depreciationMethod: m, decliningRatePct: 24, totalExpectedUnits: 500_000, accumulatedDepreciation: 100_000 };
      expect(depreciationForPeriod(a, 10_000).toNumber(), m).toBe(0);
    }
  });

  it("charges nothing when residual already equals cost", () => {
    for (const m of methods) {
      const a = { ...truck, depreciationMethod: m, decliningRatePct: 24, totalExpectedUnits: 500_000, residualValue: 120_000 };
      expect(depreciationForPeriod(a, 10_000).toNumber(), m).toBe(0);
    }
  });

  it("never returns a negative charge", () => {
    for (const m of methods) {
      const a = { ...truck, depreciationMethod: m, decliningRatePct: 24, totalExpectedUnits: 500_000, accumulatedDepreciation: 150_000 };
      expect(depreciationForPeriod(a, 10_000).greaterThanOrEqualTo(0), m).toBe(true);
    }
  });
});
