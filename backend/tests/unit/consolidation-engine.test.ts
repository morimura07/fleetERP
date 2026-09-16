import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  consolidate, defaultRateType, eliminationJournal,
  type AccountBalance, type MapRule, type CurrencyRates, type ConsolidationInput,
} from "@backend/services/consolidation-engine";

const n = (v: Prisma.Decimal) => v.toNumber();

/**
 * Worked by hand so an accountant can check it.
 *
 * KE01 keeps its books in KES; the group reports in USD.
 *   Rates (USD per KES):  closing at start 0.0080, closing at end 0.0075,
 *                         average prior 0.0082, average this period 0.0078,
 *                         historical 0.0085.
 *   KE01 trial balance (KES), debits positive:
 *     1100 Bank           begin 1,000,000   Dr 500,000  Cr 200,000   end 1,300,000
 *     2100 Loan from HQ   begin  -400,000                            end  -400,000   (intercompany)
 *     3000 Share capital  begin  -600,000                            end  -600,000
 *     4000 Revenue        begin         0             Cr 500,000     end  -500,000
 *     5000 Expenses       begin         0   Dr 200,000               end   200,000
 *   Both ends sum to zero, as a trial balance must.
 *
 *   Translated (USD):
 *     Bank      begin 8,000     end 9,750    (closing rates)
 *     Loan      begin -3,200    end -3,000   (closing rates); eliminated +3,000
 *     Capital   begin -5,100    end -5,100   (historical)
 *     Revenue   activity -3,900              (average this period)
 *     Expenses  activity  1,560              (average this period)
 *   Sum of ending = 9,750 - 3,000 - 5,100 - 3,900 + 1,560 = -690  ->  CTA end  +690 (a loss: KES weakened)
 *   Sum of beginning = 8,000 - 3,200 - 5,100 = -300               ->  CTA begin +300
 *   CTA movement for the period = 390.
 */
const KES: CurrencyRates = { closingBegin: 0.008, closingEnd: 0.0075, averagePrior: 0.0082, averagePeriod: 0.0078, historical: 0.0085 };

const ke = (subAccount: string, name: string, accountType: AccountBalance["accountType"], beginning: number, debit = 0, credit = 0): AccountBalance =>
  ({ subsidiary: "KE01", subAccount, subAccountName: name, accountType, currency: "KES", beginningLocal: beginning, debitLocal: debit, creditLocal: credit });

const KE_BALANCES: AccountBalance[] = [
  ke("1100", "Bank", "ASSET", 1_000_000, 500_000, 200_000),
  ke("2100", "Loan from HQ", "LIABILITY", -400_000),
  ke("3000", "Share capital", "EQUITY", -600_000),
  ke("4000", "Freight revenue", "INCOME", 0, 0, 500_000),
  ke("5000", "Operating expenses", "EXPENSE", 0, 200_000),
];

const KE_MAPS: MapRule[] = [
  { subsidiary: "KE01", subAccount: "1100", parentAccount: "1100", parentAccountName: "Bank accounts", intercompany: false },
  { subsidiary: "KE01", subAccount: "2100", parentAccount: "2150", parentAccountName: "Intercompany payable", intercompany: true },
  { subsidiary: "KE01", subAccount: "3000", parentAccount: "3000", parentAccountName: "Share capital", intercompany: false },
  { subsidiary: "KE01", subAccount: "4000", parentAccount: "4000", parentAccountName: "Freight revenue", intercompany: false },
  { subsidiary: "KE01", subAccount: "5000", parentAccount: "5000", parentAccountName: "Operating expenses", intercompany: false },
];

/** HQ's own side of the loan, so the group's IC balances net to zero. */
const HQ_BALANCES: AccountBalance[] = [
  { subsidiary: "HQ01", subAccount: "1250", subAccountName: "Loan to KE01", accountType: "ASSET", currency: "USD", beginningLocal: 3_200, debitLocal: 0, creditLocal: 200 },
];
const HQ_MAPS: MapRule[] = [
  { subsidiary: "HQ01", subAccount: "1250", parentAccount: "1250", parentAccountName: "Intercompany receivable", intercompany: true },
];

const base = (over: Partial<ConsolidationInput> = {}): ConsolidationInput => ({
  parentArea: "HQ01",
  baseCurrency: "USD",
  balances: [...KE_BALANCES, ...HQ_BALANCES],
  maps: [...KE_MAPS, ...HQ_MAPS],
  entities: [{ subsidiary: "KE01", sharePct: 100, ctaAccount: "3900" }],
  rates: { KES },
  parentAccountNames: { "3900": "Cumulative translation adjustment" },
  ...over,
});

const line = (out: ReturnType<typeof consolidate>, sub: string, acct: string) => out.lines.find((l) => l.subsidiary === sub && l.subAccount === acct)!;

describe("rate type by account type", () => {
  it("uses closing for the balance sheet, average for the P&L, historical for equity", () => {
    expect(defaultRateType("ASSET")).toBe("SPOT");
    expect(defaultRateType("LIABILITY")).toBe("SPOT");
    expect(defaultRateType("INCOME")).toBe("AVERAGE");
    expect(defaultRateType("EXPENSE")).toBe("AVERAGE");
    expect(defaultRateType("EQUITY")).toBe("HISTORICAL");
  });

  it("lets the mapping override the default", () => {
    const out = consolidate(base({ maps: [{ ...KE_MAPS[0], rateType: "HISTORICAL" }, ...KE_MAPS.slice(1), ...HQ_MAPS] }));
    expect(line(out, "KE01", "1100").rateType).toBe("HISTORICAL");
    expect(n(line(out, "KE01", "1100").endingBase)).toBe(1_300_000 * 0.0085);
  });
});

describe("the worked example", () => {
  const out = consolidate(base());

  it("restates a balance-sheet account at each closing rate", () => {
    const bank = line(out, "KE01", "1100");
    expect(n(bank.endingLocal)).toBe(1_300_000);
    expect(n(bank.beginningBase)).toBe(8_000);
    expect(n(bank.endingBase)).toBe(9_750);
    expect(n(bank.activityBase)).toBe(1_750);
    expect(n(bank.rate!)).toBe(0.0075);
  });

  it("translates the period's income and expenses at the average rate", () => {
    expect(n(line(out, "KE01", "4000").activityBase)).toBe(-3_900);
    expect(n(line(out, "KE01", "5000").activityBase)).toBe(1_560);
    expect(n(line(out, "KE01", "4000").endingBase)).toBe(-3_900);
  });

  it("keeps equity at the historical rate at both ends", () => {
    const cap = line(out, "KE01", "3000");
    expect(n(cap.beginningBase)).toBe(-5_100);
    expect(n(cap.endingBase)).toBe(-5_100);
    expect(n(cap.activityBase)).toBe(0);
  });

  it("derives the CTA as what makes the translated books balance", () => {
    const cta = line(out, "KE01", "CTA");
    expect(cta.isCta).toBe(true);
    expect(cta.parentAccount).toBe("3900");
    expect(n(cta.beginningBase)).toBe(300);
    expect(n(cta.endingBase)).toBe(690);
    expect(n(cta.activityBase)).toBe(390);
    // With the CTA in, the subsidiary's translated lines sum to zero again.
    const keSum = out.lines.filter((l) => l.subsidiary === "KE01").reduce((s, l) => s.plus(l.endingBase), new Prisma.Decimal(0));
    expect(n(keSum)).toBe(0);
  });

  it("eliminates both sides of the intercompany loan", () => {
    expect(n(line(out, "KE01", "2100").eliminationBase)).toBe(3_000);
    expect(n(line(out, "KE01", "2100").consolidatedBase)).toBe(0);
    expect(n(line(out, "HQ01", "1250").eliminationBase)).toBe(-3_000);
    expect(n(out.warnings.icMismatchBase)).toBe(0);
    expect(out.warnings.notes.find((s) => /Intercompany/.test(s))).toBeUndefined();
  });

  it("does not translate or adjust the parent's own books", () => {
    const hq = line(out, "HQ01", "1250");
    expect(n(hq.rate!)).toBe(1);
    expect(n(hq.endingBase)).toBe(3_000);
    expect(out.lines.find((l) => l.subsidiary === "HQ01" && l.isCta)).toBeUndefined();
  });

  it("reports group totals", () => {
    expect(n(out.totals.ctaBase)).toBe(690);
    expect(n(out.totals.ctaActivityBase)).toBe(390);
    expect(n(out.totals.eliminationBase)).toBe(0);
    // Everything translated, CTA included, balances group-wide.
    expect(n(out.totals.endingBase)).toBe(3_000); // HQ's loan is the only line without a counter-line in these books
  });

  it("rolls consolidated figures up by parent account", () => {
    const bank = out.byParentAccount.find((r) => r.parentAccount === "1100")!;
    expect(n(bank.consolidatedBase)).toBe(9_750);
    expect(n(out.byParentAccount.find((r) => r.parentAccount === "2150")!.consolidatedBase)).toBe(0);
  });
});

describe("ownership share", () => {
  it("consolidates a 60% subsidiary proportionately, CTA included", () => {
    const out = consolidate(base({ entities: [{ subsidiary: "KE01", sharePct: 60, ctaAccount: "3900" }] }));
    expect(n(line(out, "KE01", "1100").consolidatedBase)).toBe(5_850);
    expect(n(line(out, "KE01", "1100").endingBase)).toBe(9_750); // translation itself is unaffected
    expect(n(line(out, "KE01", "CTA").consolidatedBase)).toBe(414);
    expect(n(out.totals.ctaBase)).toBe(414);
  });

  it("warns when a subsidiary has no share configured and uses 100%", () => {
    const out = consolidate(base({ entities: [] }));
    expect(out.warnings.notes.some((s) => s.startsWith("KE01: no ownership share"))).toBe(true);
    expect(n(line(out, "KE01", "1100").consolidatedBase)).toBe(9_750);
  });
});

describe("warnings", () => {
  it("flags an intercompany balance with no counter-side", () => {
    const out = consolidate(base({ balances: KE_BALANCES, maps: KE_MAPS }));
    expect(n(out.warnings.icMismatchBase)).toBe(-3_000);
    expect(out.warnings.notes.some((s) => /do not net to zero/.test(s))).toBe(true);
  });

  it("flags a missing rate and does not silently use 1", () => {
    const out = consolidate(base({ rates: { KES: { ...KES, averagePeriod: null, averagePrior: null } } }));
    expect(out.warnings.missingRates).toEqual(["KES:AVERAGE"]);
    expect(line(out, "KE01", "4000").rate).toBeNull();
  });

  it("rolls an unmapped subsidiary account up under its own code and says so", () => {
    const out = consolidate(base({ maps: [...KE_MAPS.filter((m) => m.subAccount !== "5000"), ...HQ_MAPS] }));
    expect(out.warnings.unmapped).toEqual(["KE01:5000"]);
    expect(line(out, "KE01", "5000").parentAccount).toBe("5000");
  });

  it("uses the closing rate for a beginning balance when no prior rate exists", () => {
    const out = consolidate(base({ rates: { KES: { ...KES, closingBegin: null } } }));
    const bank = line(out, "KE01", "1100");
    expect(n(bank.beginningBase)).toBe(7_500); // 1,000,000 x 0.0075
    expect(n(bank.activityBase)).toBe(2_250);
  });
});

describe("elimination journal", () => {
  it("is balanced when the group's IC balances net to zero", () => {
    const out = consolidate(base());
    const j = eliminationJournal(out.lines);
    expect(j).toHaveLength(2);
    const dr = j.reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0));
    const cr = j.reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0));
    expect(n(dr)).toBe(3_000);
    expect(n(cr)).toBe(3_000);
    expect(j.find((l) => l.parentAccount === "2150")!.debit.toNumber()).toBe(3_000); // the payable is debited away
    expect(j.find((l) => l.parentAccount === "1250")!.credit.toNumber()).toBe(3_000); // the receivable credited away
  });

  it("carries nothing for a run without intercompany lines", () => {
    const out = consolidate(base({ balances: KE_BALANCES.filter((b) => b.subAccount !== "2100"), maps: KE_MAPS }));
    expect(eliminationJournal(out.lines)).toEqual([]);
  });
});
