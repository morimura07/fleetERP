import { describe, it, expect } from "vitest";
import { checkBalanced, type LineInput } from "@backend/services/ledger";

describe("checkBalanced", () => {
  const line = (debit: string, credit: string): LineInput => ({
    accountId: "acc",
    debit,
    credit,
  });

  it("accepts a balanced two-line entry", () => {
    const res = checkBalanced([line("100.00", "0"), line("0", "100.00")]);
    expect(res.balanced).toBe(true);
    expect(res.totalDebit.toString()).toBe("100");
    expect(res.totalCredit.toString()).toBe("100");
  });

  it("rejects when debits and credits differ", () => {
    expect(checkBalanced([line("100", "0"), line("0", "90")]).balanced).toBe(false);
  });

  it("rejects a single-line entry", () => {
    expect(checkBalanced([line("100", "0")]).balanced).toBe(false);
  });

  it("rejects a line with both debit and credit non-zero", () => {
    expect(checkBalanced([line("50", "50"), line("0", "0")]).balanced).toBe(false);
  });

  it("rejects a line with neither debit nor credit", () => {
    expect(checkBalanced([line("0", "0"), line("0", "0")]).balanced).toBe(false);
  });

  it("rejects negative amounts", () => {
    expect(checkBalanced([line("-100", "0"), line("0", "-100")]).balanced).toBe(false);
  });

  it("rejects an all-zero (empty value) balanced set", () => {
    // totals equal but zero — not a real posting
    expect(checkBalanced([line("0", "0"), line("0", "0")]).balanced).toBe(false);
  });

  it("balances a multi-line split across several accounts", () => {
    const res = checkBalanced([
      line("70.00", "0"),
      line("30.00", "0"),
      line("0", "100.00"),
    ]);
    expect(res.balanced).toBe(true);
  });

  it("handles decimal precision without float drift", () => {
    const res = checkBalanced([
      line("0.10", "0"),
      line("0.20", "0"),
      line("0", "0.30"),
    ]);
    expect(res.balanced).toBe(true);
  });
});
