import { describe, it, expect } from "vitest";
import { unrealizedGain, periodEnd } from "@backend/services/fx-revaluation";

describe("unrealizedGain — FX revaluation math", () => {
  // 1,000 foreign outstanding; booked at 0.90, period-end 1.00 (currency strengthened).
  it("AR gains when the foreign currency strengthens (rate ↑)", () => {
    const g = unrealizedGain("AR", 1000, "0.90", "1.00");
    expect(g.toFixed(2)).toBe("100.00"); // receivable worth 100 more base
  });

  it("AR loses when the foreign currency weakens (rate ↓)", () => {
    const g = unrealizedGain("AR", 1000, "1.00", "0.90");
    expect(g.toFixed(2)).toBe("-100.00");
  });

  it("AP loses when the foreign currency strengthens (rate ↑)", () => {
    const g = unrealizedGain("AP", 1000, "0.90", "1.00");
    expect(g.toFixed(2)).toBe("-100.00"); // we owe 100 more base
  });

  it("AP gains when the foreign currency weakens (rate ↓)", () => {
    const g = unrealizedGain("AP", 1000, "1.00", "0.90");
    expect(g.toFixed(2)).toBe("100.00");
  });

  it("no movement ⇒ zero", () => {
    expect(unrealizedGain("AR", 500, "1.20", "1.20").toFixed(2)).toBe("0.00");
    expect(unrealizedGain("AP", 500, "1.20", "1.20").toFixed(2)).toBe("0.00");
  });

  it("scales with the outstanding amount", () => {
    expect(unrealizedGain("AR", 2500, "0.80", "0.84").toFixed(2)).toBe("100.00");
  });
});

describe("periodEnd", () => {
  it("returns the last day of the month", () => {
    expect(periodEnd(2026, 2).getDate()).toBe(28); // Feb 2026 (not leap)
    expect(periodEnd(2024, 2).getDate()).toBe(29); // Feb 2024 (leap)
    expect(periodEnd(2026, 6).getDate()).toBe(30); // June
    expect(periodEnd(2026, 12).getDate()).toBe(31); // December
  });
});
