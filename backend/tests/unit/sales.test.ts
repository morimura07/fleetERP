import { describe, it, expect } from "vitest";
import { lineAmount, quoteTotal, canTransition, QUOTE_TRANSITIONS } from "@backend/services/sales";

describe("quote line amount", () => {
  it("is quantity × unit price", () => {
    expect(lineAmount(2, 150).toFixed(2)).toBe("300.00");
  });
  it("handles fractional quantities", () => {
    expect(lineAmount(1.5, 100).toFixed(2)).toBe("150.00");
    expect(lineAmount("2.5", "33.33").toFixed(2)).toBe("83.33");
  });
  it("is zero when the price is zero", () => {
    expect(lineAmount(10, 0).toFixed(2)).toBe("0.00");
  });
});

describe("quote total", () => {
  it("sums line amounts", () => {
    const t = quoteTotal([
      { quantity: 2, unitPrice: 150 }, // 300
      { quantity: 1, unitPrice: 500 }, // 500
      { quantity: 3, unitPrice: 20 },  // 60
    ]);
    expect(t.toFixed(2)).toBe("860.00");
  });
  it("is zero for no lines", () => {
    expect(quoteTotal([]).toFixed(2)).toBe("0.00");
  });
});

describe("quote status transitions", () => {
  it("allows the happy path DRAFT → SENT → ACCEPTED", () => {
    expect(canTransition("DRAFT", "SENT")).toBe(true);
    expect(canTransition("SENT", "ACCEPTED")).toBe(true);
  });
  it("allows rejecting/expiring from open states", () => {
    expect(canTransition("DRAFT", "REJECTED")).toBe(true);
    expect(canTransition("SENT", "EXPIRED")).toBe(true);
    expect(canTransition("ACCEPTED", "REJECTED")).toBe(true);
  });
  it("forbids skipping straight to ACCEPTED from DRAFT", () => {
    expect(canTransition("DRAFT", "ACCEPTED")).toBe(false);
  });
  it("never allows CONVERTED as a manual target", () => {
    for (const from of Object.keys(QUOTE_TRANSITIONS) as (keyof typeof QUOTE_TRANSITIONS)[]) {
      expect(canTransition(from, "CONVERTED")).toBe(false);
    }
  });
  it("treats REJECTED, EXPIRED, CONVERTED as terminal", () => {
    expect(QUOTE_TRANSITIONS.REJECTED).toEqual([]);
    expect(QUOTE_TRANSITIONS.EXPIRED).toEqual([]);
    expect(QUOTE_TRANSITIONS.CONVERTED).toEqual([]);
  });
});
