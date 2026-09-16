import { describe, it, expect } from "vitest";
import {
  DEFAULT_TIERS, tierFor, matrixProblems, planDecisions, outcome, openDecisionsFor, needsRetrigger, type TierLike,
} from "@backend/services/doa-engine";

const TIERS: TierLike[] = DEFAULT_TIERS.map((t, i) => ({ ...t, id: `t${i + 1}` }));
const POLICY = { retriggerVariancePct: 5, retriggerVarianceAmount: 0 };

describe("the document's matrix", () => {
  it("places amounts in the four bands", () => {
    expect(tierFor(4_999.99, TIERS)!.name).toBe("Under 5,000");
    expect(tierFor(5_000, TIERS)!.name).toBe("Under 5,000");
    expect(tierFor(5_000.01, TIERS)!.name).toBe("5,001 to 25,000");
    expect(tierFor(25_000, TIERS)!.name).toBe("5,001 to 25,000");
    expect(tierFor(25_000.01, TIERS)!.name).toBe("25,001 to 100,000");
    expect(tierFor(100_000, TIERS)!.name).toBe("25,001 to 100,000");
    expect(tierFor(100_000.01, TIERS)!.name).toBe("Above 100,000");
    expect(tierFor(5_000_000, TIERS)!.name).toBe("Above 100,000");
  });

  it("has no gaps or overlaps", () => {
    expect(matrixProblems(TIERS)).toEqual([]);
  });

  it("needs both Procurement Head and Finance Head in the second band", () => {
    const t = tierFor(10_000, TIERS)!;
    expect(planDecisions(t)).toEqual([{ step: 1, roleKey: "PROCUREMENT_HEAD" }, { step: 1, roleKey: "FINANCE_HEAD" }]);
    expect(outcome(t, [{ step: 1, roleKey: "PROCUREMENT_HEAD", status: "APPROVED" }, { step: 1, roleKey: "FINANCE_HEAD", status: "PENDING" }])).toBe("PENDING");
    expect(outcome(t, [{ step: 1, roleKey: "PROCUREMENT_HEAD", status: "APPROVED" }, { step: 1, roleKey: "FINANCE_HEAD", status: "APPROVED" }])).toBe("APPROVED");
  });

  it("lets either the CEO or the Board sign as one of two above 100,000", () => {
    const t = tierFor(250_000, TIERS)!;
    expect(t.minSignatures).toBe(2);
    expect(outcome(t, [{ step: 1, roleKey: "CEO", status: "APPROVED" }, { step: 1, roleKey: "BOARD", status: "PENDING" }])).toBe("PENDING");
  });
});

describe("matrix problems", () => {
  it("finds a gap", () => {
    const gappy = TIERS.map((t) => (t.id === "t2" ? { ...t, minAmount: 6_000 } : t));
    expect(matrixProblems(gappy).some((p) => /Gap between Under 5,000/.test(p))).toBe(true);
    expect(tierFor(5_500, gappy)).toBeNull();
  });

  it("finds an overlap and a missing ceiling", () => {
    const overlapping = TIERS.map((t) => (t.id === "t2" ? { ...t, minAmount: 4_000 } : t));
    expect(matrixProblems(overlapping).some((p) => /overlap/.test(p))).toBe(true);
    const noCeiling = TIERS.map((t) => (t.id === "t1" ? { ...t, maxAmount: null } : t));
    expect(matrixProblems(noCeiling).some((p) => /no ceiling/.test(p))).toBe(true);
  });

  it("flags a tier with no roles or too many signatures", () => {
    const bad = TIERS.map((t) => (t.id === "t3" ? { ...t, approverRoles: [] } : t.id === "t4" ? { ...t, minSignatures: 3 } : t));
    const problems = matrixProblems(bad);
    expect(problems.some((p) => /no approver roles/.test(p))).toBe(true);
    expect(problems.some((p) => /needs 3 signatures but lists 2/.test(p))).toBe(true);
  });

  it("says when nothing is active", () => {
    expect(matrixProblems(TIERS.map((t) => ({ ...t, isActive: false })))).toEqual(["No active tiers: nothing can be approved."]);
  });
});

describe("modes", () => {
  const seq: TierLike = { id: "s", name: "Seq", minAmount: 0, maxAmount: null, approverRoles: ["A", "B", "C"], mode: "SEQUENTIAL", minSignatures: 3, sortOrder: 1, isActive: true };

  it("numbers sequential steps and opens only the lowest pending one", () => {
    expect(planDecisions(seq).map((d) => d.step)).toEqual([1, 2, 3]);
    const decisions = [
      { id: "d1", step: 1, roleKey: "A", status: "APPROVED" as const },
      { id: "d2", step: 2, roleKey: "B", status: "PENDING" as const },
      { id: "d3", step: 3, roleKey: "C", status: "PENDING" as const },
    ];
    expect(openDecisionsFor(seq, decisions, ["C"])).toEqual([]);
    expect(openDecisionsFor(seq, decisions, ["B"]).map((d) => d.id)).toEqual(["d2"]);
  });

  it("opens every pending step in parallel mode", () => {
    const par = { ...seq, mode: "PARALLEL" as const };
    const decisions = [
      { id: "d1", step: 1, roleKey: "A", status: "PENDING" as const },
      { id: "d2", step: 1, roleKey: "B", status: "PENDING" as const },
    ];
    expect(openDecisionsFor(par, decisions, ["B", "STAFF"]).map((d) => d.id)).toEqual(["d2"]);
  });

  it("is approved by one signature in ANY mode regardless of minSignatures", () => {
    const any = { ...seq, mode: "ANY" as const };
    expect(outcome(any, [{ step: 1, roleKey: "A", status: "APPROVED" }, { step: 1, roleKey: "B", status: "PENDING" }, { step: 1, roleKey: "C", status: "PENDING" }])).toBe("APPROVED");
  });

  it("rejects on any rejection", () => {
    expect(outcome(seq, [{ step: 1, roleKey: "A", status: "APPROVED" }, { step: 2, roleKey: "B", status: "REJECTED" }, { step: 3, roleKey: "C", status: "PENDING" }])).toBe("REJECTED");
  });
});

describe("re-trigger on change orders", () => {
  it("does nothing for a decrease or a small increase inside the tier", () => {
    expect(needsRetrigger(10_000, 9_000, TIERS, POLICY).retrigger).toBe(false);
    expect(needsRetrigger(10_000, 10_400, TIERS, POLICY).retrigger).toBe(false); // +4%
  });

  it("re-opens the tier when the increase exceeds the percentage", () => {
    const r = needsRetrigger(10_000, 10_600, TIERS, POLICY); // +6%
    expect(r.retrigger).toBe(true);
    expect(r.reason).toMatch(/6% exceeds 5%/);
  });

  it("re-opens when the change moves the subject into another tier, even if small", () => {
    const r = needsRetrigger(24_900, 25_100, TIERS, POLICY); // +0.8% but crosses 25,000
    expect(r.retrigger).toBe(true);
    expect(r.reason).toMatch(/moves from 5,001 to 25,000 to 25,001 to 100,000/);
  });

  it("honours a money threshold when set", () => {
    const r = needsRetrigger(10_000, 10_300, TIERS, { retriggerVariancePct: 0, retriggerVarianceAmount: 200 });
    expect(r.retrigger).toBe(true);
    expect(r.reason).toMatch(/300.00 exceeds 200.00/);
  });

  it("treats a change from zero as a full re-trigger", () => {
    expect(needsRetrigger(0, 100, TIERS, POLICY).retrigger).toBe(true);
  });
});
