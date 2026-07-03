import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { applyReceipt, issueValue, itemValue } from "@backend/services/inventory";
import { AuthError } from "@backend/lib/errors";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const state = (qty: string, avg: string) => ({ qty: D(qty), avgCost: D(avg) });

describe("inventory moving-average costing", () => {
  it("first receipt sets the average to the unit cost", () => {
    const s = applyReceipt(state("0", "0"), 100, "2.50");
    expect(s.qty.toString()).toBe("100");
    expect(s.avgCost.toString()).toBe("2.5");
  });

  it("second receipt at a different cost blends the average", () => {
    // 100 @ 2.50 = 250; + 100 @ 3.50 = 350 ⇒ 200 @ 3.00
    const s = applyReceipt(state("100", "2.50"), 100, "3.50");
    expect(s.qty.toString()).toBe("200");
    expect(s.avgCost.toString()).toBe("3");
  });

  it("issue relieves at the current average and leaves it unchanged", () => {
    const { state: s, value } = issueValue(state("200", "3.00"), 50);
    expect(value.toFixed(2)).toBe("150.00"); // 50 × 3.00
    expect(s.qty.toString()).toBe("150");
    expect(s.avgCost.toString()).toBe("3"); // average unchanged on issue
  });

  it("a receipt after an issue re-blends against the remaining balance", () => {
    let s = applyReceipt(state("0", "0"), 10, "5.00"); // 10 @ 5
    ({ state: s } = issueValue(s, 4)); // 6 @ 5
    s = applyReceipt(s, 6, "7.00"); // (30 + 42) / 12 = 6.00
    expect(s.qty.toString()).toBe("12");
    expect(s.avgCost.toString()).toBe("6");
  });

  it("rejects a non-positive receipt or issue", () => {
    expect(() => applyReceipt(state("0", "0"), 0, "1")).toThrow(AuthError);
    expect(() => issueValue(state("10", "1"), 0)).toThrow(AuthError);
  });

  it("rejects issuing more than on hand", () => {
    expect(() => issueValue(state("5", "1.00"), 6)).toThrow(AuthError);
  });

  it("itemValue = quantity × avgCost", () => {
    expect(itemValue({ quantityOnHand: "12", avgCost: "6.00" }).toFixed(2)).toBe("72.00");
  });
});
