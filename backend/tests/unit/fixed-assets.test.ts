import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { monthlyDepreciation, bookValue, periodOf } from "@backend/services/fixed-assets";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// Convenience: build the shape monthlyDepreciation() reads.
function asset(cost: number, residual: number, months: number, accum: number) {
  return {
    acquisitionCost: D(cost),
    residualValue: D(residual),
    usefulLifeMonths: months,
    accumulatedDepreciation: D(accum),
  };
}

describe("straight-line monthly depreciation", () => {
  it("depreciates (cost − residual) / life each month", () => {
    // 12,000 − 0 over 60 months = 200/mo
    expect(monthlyDepreciation(asset(12000, 0, 60, 0)).toFixed(2)).toBe("200.00");
  });

  it("respects residual value in the depreciable base", () => {
    // (12,000 − 2,000) / 50 = 200/mo
    expect(monthlyDepreciation(asset(12000, 2000, 50, 0)).toFixed(2)).toBe("200.00");
  });

  it("caps the final period at the remaining depreciable amount", () => {
    // base 9,000 over 3 months = 3,000/mo; after two months accum = 6,000,
    // remaining = 3,000, so the last month charges exactly the remainder.
    expect(monthlyDepreciation(asset(9000, 0, 3, 6000)).toFixed(2)).toBe("3000.00");
    // If only 100 is left (below the straight-line rate), charge just the 100.
    expect(monthlyDepreciation(asset(9000, 0, 3, 8900)).toFixed(2)).toBe("100.00");
  });

  it("returns zero once fully depreciated to the residual floor", () => {
    // accum already equals the full depreciable base → nothing left
    expect(monthlyDepreciation(asset(8000, 500, 30, 7500)).toFixed(2)).toBe("0.00");
  });

  it("returns zero for a non-depreciable asset (residual ≥ cost)", () => {
    expect(monthlyDepreciation(asset(5000, 5000, 60, 0)).toFixed(2)).toBe("0.00");
    expect(monthlyDepreciation(asset(5000, 6000, 60, 0)).toFixed(2)).toBe("0.00");
  });

  it("returns zero when useful life is zero", () => {
    expect(monthlyDepreciation(asset(5000, 0, 0, 0)).toFixed(2)).toBe("0.00");
  });

  it("sum of every monthly charge lands exactly on the residual value", () => {
    // Walk the whole life and confirm book value ends at residual, never below.
    let accum = D(0);
    const cost = 10000, residual = 1000, life = 7; // 9,000/7 = 1285.71/mo, awkward on purpose
    for (let i = 0; i < life + 2; i++) {
      const charge = monthlyDepreciation(asset(cost, residual, life, accum.toNumber()));
      accum = accum.plus(charge);
    }
    // fully depreciated: accumulated = depreciable base
    expect(accum.toFixed(2)).toBe(D(cost).minus(residual).toFixed(2));
    // book value never dips below residual
    expect(bookValue(cost, accum).greaterThanOrEqualTo(residual)).toBe(true);
  });
});

describe("book value", () => {
  it("is cost minus accumulated depreciation", () => {
    expect(bookValue(12000, 4200).toFixed(2)).toBe("7800.00");
  });
});

describe("disposal gain/loss (proceeds vs book value)", () => {
  // The service posts gain when proceeds > book value and loss when below.
  const nbv = (cost: number, accum: number) => bookValue(cost, accum);

  it("proceeds above book value ⇒ gain", () => {
    const gain = D(5000).minus(nbv(12000, 8000)); // book value 4,000
    expect(gain.toFixed(2)).toBe("1000.00");
    expect(gain.greaterThan(0)).toBe(true);
  });

  it("proceeds below book value ⇒ loss", () => {
    const gain = D(2500).minus(nbv(12000, 8000)); // book value 4,000
    expect(gain.toFixed(2)).toBe("-1500.00");
    expect(gain.lessThan(0)).toBe(true);
  });

  it("disposal posting balances: accumDep + proceeds ± gain/loss = cost", () => {
    const cost = 12000, accum = 8000, proceeds = 5000;
    const gain = D(proceeds).minus(nbv(cost, accum)); // +1000
    // Dr accumDep + Dr proceeds  =  Cr cost + Cr gain   (gain positive)
    const debits = D(accum).plus(proceeds);
    const credits = D(cost).plus(gain);
    expect(debits.toFixed(2)).toBe(credits.toFixed(2));
  });
});

describe("period helper", () => {
  it("formats a date as YYYY-MM in UTC", () => {
    expect(periodOf(new Date("2026-07-07T00:00:00Z"))).toBe("2026-07");
    expect(periodOf(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01");
    expect(periodOf(new Date("2026-12-01T12:00:00Z"))).toBe("2026-12");
  });
});
