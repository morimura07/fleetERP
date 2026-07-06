import { describe, it, expect } from "vitest";
import { reconcile } from "@backend/services/expense";

describe("expense claim ↔ advance reconciliation", () => {
  it("claim equals advance ⇒ fully cleared, nothing owed either way", () => {
    const r = reconcile(500, 500);
    expect(r.clearedFromAdvance.toFixed(2)).toBe("500.00");
    expect(r.topUpOwed.toFixed(2)).toBe("0.00");
    expect(r.returnedByDriver.toFixed(2)).toBe("0.00");
    expect(r.reconciled.toFixed(2)).toBe("0.00");
  });

  it("claim exceeds advance ⇒ top-up owed to the driver", () => {
    const r = reconcile(700, 500);
    expect(r.clearedFromAdvance.toFixed(2)).toBe("500.00");
    expect(r.topUpOwed.toFixed(2)).toBe("200.00");
    expect(r.returnedByDriver.toFixed(2)).toBe("0.00");
    expect(r.reconciled.toFixed(2)).toBe("200.00"); // + = company owes driver
  });

  it("advance exceeds claim ⇒ driver returns the surplus", () => {
    const r = reconcile(300, 500);
    expect(r.clearedFromAdvance.toFixed(2)).toBe("300.00");
    expect(r.topUpOwed.toFixed(2)).toBe("0.00");
    expect(r.returnedByDriver.toFixed(2)).toBe("200.00");
    expect(r.reconciled.toFixed(2)).toBe("-200.00"); // − = driver returns
  });

  it("no advance ⇒ whole claim is owed to the driver", () => {
    const r = reconcile(450, 0);
    expect(r.clearedFromAdvance.toFixed(2)).toBe("0.00");
    expect(r.topUpOwed.toFixed(2)).toBe("450.00");
    expect(r.reconciled.toFixed(2)).toBe("450.00");
  });

  it("cleared + top-up always equals the claim total (posting balances)", () => {
    for (const [total, adv] of [[700, 500], [300, 500], [450, 0], [1000, 1000]]) {
      const r = reconcile(total, adv);
      expect(r.clearedFromAdvance.plus(r.topUpOwed).toFixed(2)).toBe(r.total.toFixed(2));
    }
  });
});
