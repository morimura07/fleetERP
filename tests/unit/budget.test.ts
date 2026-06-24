import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { checkBudget, lineStatus } from "@/lib/services/budget";

const D = (v: string) => new Prisma.Decimal(v);

describe("checkBudget", () => {
  it("allows a posting within the ceiling", () => {
    const d = checkBudget("STRICT_BLOCK", D("1000"), D("400"), "200");
    expect(d.allowed).toBe(true);
    expect(d.warning).toBeNull();
    expect(d.remaining).toBe("400.00");
  });

  it("STRICT_BLOCK rejects an over-budget posting", () => {
    const d = checkBudget("STRICT_BLOCK", D("1000"), D("900"), "200");
    expect(d.allowed).toBe(false);
    expect(d.warning).toContain("100.00");
  });

  it("WARNING_ONLY allows but warns when over budget", () => {
    const d = checkBudget("WARNING_ONLY", D("1000"), D("900"), "200");
    expect(d.allowed).toBe(true);
    expect(d.warning).toContain("100.00");
    expect(d.remaining).toBe("-100.00");
  });

  it("OVERRIDE blocks without an override and allows with one", () => {
    expect(checkBudget("OVERRIDE", D("1000"), D("900"), "200", false).allowed).toBe(false);
    expect(checkBudget("OVERRIDE", D("1000"), D("900"), "200", true).allowed).toBe(true);
  });

  it("treats an exact-to-ceiling posting as within budget", () => {
    const d = checkBudget("STRICT_BLOCK", D("1000"), D("800"), "200");
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe("0.00");
  });
});

describe("lineStatus", () => {
  it("computes remaining and utilization percentage", () => {
    const s = lineStatus({ id: "1", kind: "OPEX", costCenter: "Fleet", accountCode: "5000", amount: D("100000"), consumed: D("32000") });
    expect(s.remaining).toBe("68000.00");
    expect(s.utilizationPct).toBe(32);
  });

  it("reports 0% utilization on a zero-amount line", () => {
    const s = lineStatus({ id: "1", kind: "OPEX", costCenter: "X", accountCode: "5000", amount: D("0"), consumed: D("0") });
    expect(s.utilizationPct).toBe(0);
  });
});
