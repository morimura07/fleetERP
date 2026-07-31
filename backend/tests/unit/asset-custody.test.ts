import { describe, it, expect } from "vitest";
import { warrantyStatus } from "@backend/services/asset-custody";

const asOf = new Date("2026-07-31T00:00:00Z");
const daysFrom = (n: number) => new Date(asOf.getTime() + n * 86_400_000);

describe("asset warranty status (M19)", () => {
  it("classifies a future warranty well outside the window as CURRENT", () => {
    expect(warrantyStatus(daysFrom(120), asOf)).toBe("CURRENT");
  });

  it("classifies a warranty inside the 30-day window as EXPIRING_SOON", () => {
    expect(warrantyStatus(daysFrom(10), asOf)).toBe("EXPIRING_SOON");
    expect(warrantyStatus(daysFrom(29), asOf)).toBe("EXPIRING_SOON");
  });

  it("classifies a past warranty as EXPIRED", () => {
    expect(warrantyStatus(daysFrom(-1), asOf)).toBe("EXPIRED");
  });

  it("reports MISSING when no warranty date is on file", () => {
    expect(warrantyStatus(null, asOf)).toBe("MISSING");
    expect(warrantyStatus(undefined, asOf)).toBe("MISSING");
  });

  it("uses a 30-day window (wider than compliance's 14) — 20 days out is still EXPIRING_SOON", () => {
    // 20 days would be CURRENT under a 14-day window but EXPIRING_SOON under 30.
    expect(warrantyStatus(daysFrom(20), asOf)).toBe("EXPIRING_SOON");
  });
});
