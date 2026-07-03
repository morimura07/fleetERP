import { describe, it, expect } from "vitest";
import { computePaye, computeStatutory, SCHEMES } from "@backend/services/statutory";

describe("PAYE progressive bands", () => {
  it("TZ: income in the tax-free band pays no PAYE", () => {
    expect(computePaye(200_000, SCHEMES.TZ.payeBands).toFixed(2)).toBe("0.00");
  });

  it("TZ: income spanning two bands taxes each slice at its marginal rate", () => {
    // 400,000: 0–270k @0 = 0; 270k–400k = 130,000 @8% = 10,400
    expect(computePaye(400_000, SCHEMES.TZ.payeBands).toFixed(2)).toBe("10400.00");
  });

  it("TZ: high income accumulates across all bands", () => {
    // 1,200,000:
    //  270k–520k = 250,000 @8%  = 20,000
    //  520k–760k = 240,000 @20% = 48,000
    //  760k–1,000k = 240,000 @25% = 60,000
    //  1,000k–1,200k = 200,000 @30% = 60,000
    //  total = 188,000
    expect(computePaye(1_200_000, SCHEMES.TZ.payeBands).toFixed(2)).toBe("188000.00");
  });

  it("KE: first shilling is taxed (band starts at rate 0.10)", () => {
    // 20,000 all in the first band @10% = 2,000
    expect(computePaye(20_000, SCHEMES.KE.payeBands).toFixed(2)).toBe("2000.00");
  });
});

describe("computeStatutory — full breakdown", () => {
  it("TZ: NSSF 10% + SHIF 3% + PAYE, net = gross − all", () => {
    const r = computeStatutory(400_000, "TZ");
    expect(r.paye.toFixed(2)).toBe("10400.00");
    expect(r.nssf.toFixed(2)).toBe("40000.00"); // 10% of 400k
    expect(r.shif.toFixed(2)).toBe("12000.00"); // 3% of 400k
    expect(r.net.toFixed(2)).toBe("337600.00"); // 400k − 10,400 − 40,000 − 12,000
  });

  it("KE: NSSF cap limits pensionable pay", () => {
    // gross 100,000; nssfCap 36,000 → nssf = 6% × 36,000 = 2,160
    const r = computeStatutory(100_000, "KE");
    expect(r.nssf.toFixed(2)).toBe("2160.00");
  });

  it("KE: SHIF minimum floor applies to tiny gross", () => {
    // gross 5,000 → 2.75% = 137.5, below the 300 floor ⇒ 300
    const r = computeStatutory(5_000, "KE");
    expect(r.shif.toFixed(2)).toBe("300.00");
  });

  it("unknown country falls back to the TZ scheme", () => {
    const r1 = computeStatutory(400_000, "ZZ");
    const r2 = computeStatutory(400_000, "TZ");
    expect(r1.net.toFixed(2)).toBe(r2.net.toFixed(2));
  });

  it("net never exceeds gross", () => {
    for (const g of [1000, 50_000, 500_000, 2_000_000]) {
      const r = computeStatutory(g, "TZ");
      expect(r.net.lessThanOrEqualTo(g)).toBe(true);
    }
  });
});
