import { describe, it, expect } from "vitest";
import { fuelEfficiency } from "@/lib/services/fuel";

describe("fuelEfficiency", () => {
  it("computes actual km/L and flags meeting target", () => {
    // 1050 km / 300 L = 3.5 km/L, target 3.5 → meets
    const r = fuelEfficiency("1050", "300", "3.5");
    expect(r.actualKmPerL).toBe("3.50");
    expect(r.status).toBe("MEETS_TARGET");
    expect(r.variancePct).toBe("0.0");
  });

  it("flags below-expected when more than tolerance under target", () => {
    // 800 km / 300 L = 2.67 km/L vs target 3.5 → well below (>10%)
    const r = fuelEfficiency("800", "300", "3.5");
    expect(r.status).toBe("BELOW_EXPECTED");
    expect(parseFloat(r.variancePct!)).toBeLessThan(0);
  });

  it("stays MEETS_TARGET within the tolerance band", () => {
    // 3.3 km/L vs 3.5 target = ~5.7% under, within 10% tolerance
    const r = fuelEfficiency("990", "300", "3.5");
    expect(r.actualKmPerL).toBe("3.30");
    expect(r.status).toBe("MEETS_TARGET");
  });

  it("returns NO_DATA when litres are zero", () => {
    expect(fuelEfficiency("1000", "0", "3.5").status).toBe("NO_DATA");
  });

  it("returns NO_DATA (with actual) when no target is set", () => {
    const r = fuelEfficiency("1000", "250", null);
    expect(r.actualKmPerL).toBe("4.00");
    expect(r.targetKmPerL).toBeNull();
    expect(r.status).toBe("NO_DATA");
  });
});
