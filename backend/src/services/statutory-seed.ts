/**
 * Starting schemes for the countries the client operates in.
 *
 * These are the published rates as best known at the time of writing, marked
 * with their source. They are a seed, not the law: the scheme lives in the
 * database precisely so that the customer's accountant can correct a figure
 * without a release. `verifiedAt` stays null until someone with authority has
 * checked them, and the payroll screen says so.
 *
 * Priyam confirmed the statutory percentages are taken from basic pay, which
 * is why every percentage rule below has basis BASIC.
 */

export interface SeedDeduction {
  code: string;
  label: string;
  employeeRatePct: number;
  employerRatePct: number;
  basis: "BASIC" | "GROSS" | "TAXABLE";
  basisCap?: number;
  minAmount?: number;
  fixedAmount?: number;
  reducesTaxable?: boolean;
  optIn?: boolean;
  sortOrder: number;
}

export interface SeedScheme {
  country: string;
  name: string;
  currency: string;
  source: string;
  payeBands: { from: number; rate: number }[];
  deductions: SeedDeduction[];
}

export const SEED_SCHEMES: SeedScheme[] = [
  {
    country: "TZ",
    name: "Tanzania - TRA, NSSF, NHIF, WCF",
    currency: "TZS",
    source:
      "PAYE bands: TRA resident individual monthly rates. NSSF 10% employee / 10% employer per NSSF Act. " +
      "NHIF 3% employee / 3% employer per NHIF Act. WCF 0.5% employer, private sector, per WCF regulations. " +
      "TUICO and CHAWAMATA 2% as given in the client's requirements document. " +
      "HESLB repayment is set per employee from their loan schedule. Rates to be confirmed by the customer's accountant.",
    // Monthly TZS bands: first 270,000 free, then 8%, 20%, 25%, 30%.
    payeBands: [
      { from: 0, rate: 0 },
      { from: 270_000, rate: 0.08 },
      { from: 520_000, rate: 0.2 },
      { from: 760_000, rate: 0.25 },
      { from: 1_000_000, rate: 0.3 },
    ],
    deductions: [
      // Employee NSSF is deductible before PAYE in Tanzania.
      { code: "NSSF", label: "NSSF pension", employeeRatePct: 10, employerRatePct: 10, basis: "BASIC", reducesTaxable: true, sortOrder: 10 },
      { code: "NHIF", label: "NHIF health", employeeRatePct: 3, employerRatePct: 3, basis: "BASIC", sortOrder: 20 },
      // WCF is an employer levy only; nothing comes off the employee.
      { code: "WCF", label: "Workers Compensation Fund", employeeRatePct: 0, employerRatePct: 0.5, basis: "GROSS", sortOrder: 30 },
      // Union dues apply to members only.
      { code: "TUICO", label: "TUICO union dues", employeeRatePct: 2, employerRatePct: 0, basis: "BASIC", optIn: true, sortOrder: 40 },
      { code: "CHAWAMATA", label: "CHAWAMATA dues", employeeRatePct: 2, employerRatePct: 0, basis: "BASIC", optIn: true, sortOrder: 50 },
      // A loan repayment is a per-employee amount, so the scheme carries the
      // rule and the employee's opt-in carries the instalment.
      { code: "HESLB", label: "HESLB student loan", employeeRatePct: 0, employerRatePct: 0, basis: "BASIC", fixedAmount: 0, optIn: true, sortOrder: 60 },
    ],
  },
  {
    country: "KE",
    name: "Kenya - KRA, NSSF, SHIF, Housing Levy",
    currency: "KES",
    source:
      "PAYE bands: KRA resident monthly rates. NSSF Tier I/II per NSSF Act 2013. SHIF 2.75% with a " +
      "KES 300 floor per SHA regulations. Affordable Housing Levy 1.5% employee / 1.5% employer. " +
      "Rates to be confirmed by the customer's accountant.",
    payeBands: [
      { from: 0, rate: 0.1 },
      { from: 24_000, rate: 0.25 },
      { from: 32_333, rate: 0.3 },
      { from: 500_000, rate: 0.325 },
      { from: 800_000, rate: 0.35 },
    ],
    deductions: [
      { code: "NSSF", label: "NSSF pension", employeeRatePct: 6, employerRatePct: 6, basis: "BASIC", basisCap: 36_000, reducesTaxable: true, sortOrder: 10 },
      { code: "SHIF", label: "SHIF health", employeeRatePct: 2.75, employerRatePct: 0, basis: "GROSS", minAmount: 300, sortOrder: 20 },
      { code: "HOUSING_LEVY", label: "Affordable Housing Levy", employeeRatePct: 1.5, employerRatePct: 1.5, basis: "GROSS", sortOrder: 30 },
    ],
  },
];
