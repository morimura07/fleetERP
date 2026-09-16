import { describe, it, expect } from "vitest";
import { computePayslip, type Scheme } from "@backend/services/payslip-engine";
import { SEED_SCHEMES } from "@backend/services/statutory-seed";

const asScheme = (country: string): Scheme => {
  const s = SEED_SCHEMES.find((x) => x.country === country)!;
  return { country, payeBands: s.payeBands, deductions: s.deductions.map((d) => ({ ...d, reducesTaxable: d.reducesTaxable ?? false, optIn: d.optIn ?? false })) };
};
const TZ = asScheme("TZ");
const KE = asScheme("KE");

const line = (slip: ReturnType<typeof computePayslip>, code: string) =>
  slip.lines.find((l) => l.code === code);

describe("a Tanzanian driver on 1,000,000 basic with allowances", () => {
  // Worked by hand so an accountant can check it:
  //   basic 1,000,000 + housing 200,000 + transport 100,000 = gross 1,300,000
  //   NSSF employee 10% of basic = 100,000, deductible before tax
  //   taxable = 1,300,000 - 100,000 = 1,200,000
  //   PAYE on 1,200,000 by TRA bands:
  //     0-270,000 @0        = 0
  //     270,000-520,000 @8% = 20,000
  //     520,000-760,000 @20%= 48,000
  //     760,000-1,000,000 @25% = 60,000
  //     1,000,000-1,200,000 @30% = 60,000        total 188,000
  //   NHIF 3% of basic = 30,000
  //   net = 1,300,000 - 100,000 - 188,000 - 30,000 = 982,000
  const slip = computePayslip(
    {
      basicPay: 1_000_000,
      allowances: [
        { code: "HOUSING", label: "Housing allowance", amount: 200_000 },
        { code: "TRANSPORT", label: "Transport allowance", amount: 100_000 },
      ],
    },
    TZ,
  );

  it("adds allowances to basic for gross", () => {
    expect(slip.gross.toNumber()).toBe(1_300_000);
  });

  it("takes NSSF from basic, not gross, as Priyam confirmed", () => {
    expect(line(slip, "NSSF")!.amount.toNumber()).toBe(100_000);
    expect(line(slip, "NSSF")!.basis!.toNumber()).toBe(1_000_000);
  });

  it("deducts NSSF before working out PAYE", () => {
    expect(slip.taxable.toNumber()).toBe(1_200_000);
  });

  it("computes PAYE across the TRA bands", () => {
    expect(slip.paye.toNumber()).toBe(188_000);
  });

  it("takes NHIF from basic and does not reduce taxable", () => {
    expect(line(slip, "NHIF")!.amount.toNumber()).toBe(30_000);
  });

  it("lands on the hand-worked net", () => {
    expect(slip.net.toNumber()).toBe(982_000);
  });

  it("reports the employer's share without deducting it", () => {
    // NSSF 10% + NHIF 3% of basic, plus WCF 0.5% of gross.
    expect(line(slip, "NSSF_EMPLOYER")!.amount.toNumber()).toBe(100_000);
    expect(line(slip, "NHIF_EMPLOYER")!.amount.toNumber()).toBe(30_000);
    expect(line(slip, "WCF_EMPLOYER")!.amount.toNumber()).toBe(6_500);
    expect(slip.employerCosts.toNumber()).toBe(136_500);
    // And none of it touched net.
    expect(slip.gross.minus(slip.deductions).toNumber()).toBe(slip.net.toNumber());
  });

  it("puts no WCF line on the employee side", () => {
    expect(slip.lines.find((l) => l.code === "WCF" && l.kind === "DEDUCTION")).toBeUndefined();
  });

  it("does not deduct union dues from a non-member", () => {
    expect(line(slip, "TUICO")).toBeUndefined();
    expect(line(slip, "CHAWAMATA")).toBeUndefined();
  });
});

describe("opt-in deductions", () => {
  const base = { basicPay: 1_000_000, allowances: [] };

  it("deducts union dues once the employee is a member", () => {
    const slip = computePayslip(base, TZ, [{ code: "TUICO" }]);
    expect(line(slip, "TUICO")!.amount.toNumber()).toBe(20_000);
  });

  it("takes a loan instalment from the employee's own figure", () => {
    const slip = computePayslip(base, TZ, [{ code: "HESLB", amountOverride: 45_000 }]);
    expect(line(slip, "HESLB")!.amount.toNumber()).toBe(45_000);
  });

  it("deducts nothing for a HESLB opt-in with no instalment set", () => {
    // The scheme's fixed amount is zero; the instalment must come from the person.
    const slip = computePayslip(base, TZ, [{ code: "HESLB" }]);
    expect(line(slip, "HESLB")!.amount.toNumber()).toBe(0);
  });

  it("ignores an opt-in for a code the scheme does not have", () => {
    const slip = computePayslip(base, TZ, [{ code: "NO_SUCH_THING" }]);
    expect(line(slip, "NO_SUCH_THING")).toBeUndefined();
  });
});

describe("Kenya, to prove the same engine serves another country", () => {
  const slip = computePayslip({ basicPay: 100_000, allowances: [] }, KE);

  it("caps pensionable pay", () => {
    // 6% of the 36,000 cap, not of 100,000.
    expect(line(slip, "NSSF")!.amount.toNumber()).toBe(2_160);
    expect(line(slip, "NSSF")!.basis!.toNumber()).toBe(36_000);
  });

  it("applies the SHIF floor", () => {
    const low = computePayslip({ basicPay: 8_000, allowances: [] }, KE);
    // 2.75% of 8,000 is 220, below the 300 floor.
    expect(line(low, "SHIF")!.amount.toNumber()).toBe(300);
  });

  it("carries the housing levy on both sides", () => {
    expect(line(slip, "HOUSING_LEVY")!.amount.toNumber()).toBe(1_500);
    expect(line(slip, "HOUSING_LEVY_EMPLOYER")!.amount.toNumber()).toBe(1_500);
  });

  it("has no Tanzanian deductions", () => {
    expect(line(slip, "NHIF")).toBeUndefined();
    expect(line(slip, "TUICO")).toBeUndefined();
  });
});

describe("guards", () => {
  it("never lets deductions take net below zero", () => {
    // A loan instalment larger than the pay: capped at what is left.
    const slip = computePayslip({ basicPay: 100_000, allowances: [] }, TZ, [{ code: "HESLB", amountOverride: 500_000 }]);
    expect(slip.net.toNumber()).toBeGreaterThanOrEqual(0);
    expect(slip.net.toNumber()).toBe(0);
  });

  it("omits a zero allowance rather than listing an empty line", () => {
    const slip = computePayslip({ basicPay: 500_000, allowances: [{ code: "HOUSING", label: "Housing", amount: 0 }] }, TZ);
    expect(line(slip, "HOUSING")).toBeUndefined();
  });

  it("includes overtime in gross and in taxable", () => {
    const slip = computePayslip({ basicPay: 500_000, allowances: [], overtimePay: 50_000 }, TZ);
    expect(slip.gross.toNumber()).toBe(550_000);
    expect(line(slip, "OVERTIME")!.amount.toNumber()).toBe(50_000);
    // NSSF still on basic, so taxable = 550,000 - 50,000 = 500,000.
    expect(slip.taxable.toNumber()).toBe(500_000);
  });

  it("orders lines earnings, pre-tax deductions, PAYE, other deductions, employer", () => {
    const slip = computePayslip({ basicPay: 1_000_000, allowances: [{ code: "HOUSING", label: "Housing", amount: 100_000 }] }, TZ, [{ code: "TUICO" }]);
    expect(slip.lines.map((l) => l.code)).toEqual([
      "BASIC", "HOUSING", "NSSF", "PAYE", "NHIF", "TUICO", "NSSF_EMPLOYER", "NHIF_EMPLOYER", "WCF_EMPLOYER",
    ]);
  });

  it("records the basis and rate on every percentage line so it can be checked", () => {
    const slip = computePayslip({ basicPay: 1_000_000, allowances: [] }, TZ);
    const nhif = line(slip, "NHIF")!;
    expect(nhif.basis!.toNumber()).toBe(1_000_000);
    expect(nhif.ratePct!.toNumber()).toBe(3);
  });
});

describe("the seed itself", () => {
  it("names a source for every country", () => {
    for (const s of SEED_SCHEMES) expect(s.source.length, s.country).toBeGreaterThan(40);
  });

  it("has ascending PAYE bands starting at zero", () => {
    for (const s of SEED_SCHEMES) {
      expect(s.payeBands[0].from).toBe(0);
      for (let i = 1; i < s.payeBands.length; i++) {
        expect(s.payeBands[i].from).toBeGreaterThan(s.payeBands[i - 1].from);
      }
    }
  });

  it("never repeats a deduction code within a country", () => {
    for (const s of SEED_SCHEMES) {
      const codes = s.deductions.map((d) => d.code);
      expect(new Set(codes).size, s.country).toBe(codes.length);
    }
  });
});
