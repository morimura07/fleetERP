import { Prisma } from "@prisma/client";
import type { DeductionBasis } from "@prisma/client";
import { computePaye, type PayeBand } from "@backend/services/statutory";

/**
 * Turns an employee's pay elements and a country's scheme into a payslip.
 *
 * Pure: the scheme arrives as data, so the same function serves Tanzania,
 * Kenya and whichever country is added next, and every rule is testable
 * without a database. This is what Priyam asked for: the regulations as
 * settings, the customer only choosing a country.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const two = (v: Prisma.Decimal) => v.toDecimalPlaces(2);

export interface Earnings {
  basicPay: Prisma.Decimal.Value;
  allowances: { code: string; label: string; amount: Prisma.Decimal.Value }[];
  overtimePay?: Prisma.Decimal.Value;
}

export interface DeductionRule {
  code: string;
  label: string;
  employeeRatePct: Prisma.Decimal.Value;
  employerRatePct: Prisma.Decimal.Value;
  basis: DeductionBasis;
  basisCap?: Prisma.Decimal.Value | null;
  minAmount?: Prisma.Decimal.Value | null;
  fixedAmount?: Prisma.Decimal.Value | null;
  reducesTaxable: boolean;
  optIn: boolean;
  sortOrder?: number;
}

export interface Scheme {
  country: string;
  payeBands: PayeBand[];
  deductions: DeductionRule[];
}

export interface OptIn {
  code: string;
  amountOverride?: Prisma.Decimal.Value | null;
}

export interface PayslipLineOut {
  kind: "EARNING" | "DEDUCTION" | "EMPLOYER";
  code: string;
  label: string;
  amount: Prisma.Decimal;
  basis?: Prisma.Decimal;
  ratePct?: Prisma.Decimal;
  sortOrder: number;
}

export interface PayslipOut {
  basic: Prisma.Decimal;
  allowances: Prisma.Decimal;
  overtimePay: Prisma.Decimal;
  gross: Prisma.Decimal;
  taxable: Prisma.Decimal;
  paye: Prisma.Decimal;
  deductions: Prisma.Decimal;
  employerCosts: Prisma.Decimal;
  net: Prisma.Decimal;
  lines: PayslipLineOut[];
}

/** The figure a rule's percentage applies to, capped where the scheme says so. */
function basisAmount(rule: DeductionRule, basic: Prisma.Decimal, gross: Prisma.Decimal, taxable: Prisma.Decimal): Prisma.Decimal {
  const raw = rule.basis === "BASIC" ? basic : rule.basis === "GROSS" ? gross : taxable;
  return rule.basisCap != null ? Prisma.Decimal.min(raw, D(rule.basisCap)) : raw;
}

/**
 * Compute one payslip.
 *
 * Order matters and is the same everywhere: earnings make gross; the
 * deductions that reduce taxable income come off first (Tanzanian NSSF does);
 * PAYE is worked out on what is left; the remaining deductions come off; net
 * is gross less every employee-side deduction. Employer costs are computed on
 * the same bases but never subtracted; they are reported so the true cost of
 * employment is visible.
 */
export function computePayslip(earnings: Earnings, scheme: Scheme, optIns: OptIn[] = []): PayslipOut {
  const basic = D(earnings.basicPay);
  const lines: PayslipLineOut[] = [];
  let order = 0;

  lines.push({ kind: "EARNING", code: "BASIC", label: "Basic pay", amount: two(basic), sortOrder: order++ });

  let allowances = D(0);
  for (const a of earnings.allowances) {
    const amt = D(a.amount);
    if (amt.lessThanOrEqualTo(0)) continue;
    allowances = allowances.plus(amt);
    lines.push({ kind: "EARNING", code: a.code, label: a.label, amount: two(amt), sortOrder: order++ });
  }

  const overtimePay = D(earnings.overtimePay ?? 0);
  if (overtimePay.greaterThan(0)) {
    lines.push({ kind: "EARNING", code: "OVERTIME", label: "Overtime", amount: two(overtimePay), sortOrder: order++ });
  }

  const gross = basic.plus(allowances).plus(overtimePay);

  const optedIn = new Map(optIns.map((o) => [o.code, o]));
  const active = [...scheme.deductions]
    .filter((r) => !r.optIn || optedIn.has(r.code))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Pass 1: the deductions that come off before tax.
  let taxable = gross;
  let deductions = D(0);
  let employerCosts = D(0);
  const applied: { rule: DeductionRule; employee: Prisma.Decimal; employer: Prisma.Decimal; basis: Prisma.Decimal; employeeSide: boolean }[] = [];

  const apply = (rule: DeductionRule, taxableSoFar: Prisma.Decimal) => {
    const override = optedIn.get(rule.code)?.amountOverride;
    const basis = basisAmount(rule, basic, gross, taxableSoFar);
    // An employer-only levy such as WCF has no employee side and gets no
    // employee line: a 0.00 deduction on every payslip is noise. A fixed
    // amount of zero still counts as a side, so an opted-in loan with no
    // instalment set shows as 0.00, which is the prompt to set one.
    const employeeSide = D(rule.employeeRatePct).greaterThan(0) || rule.fixedAmount != null || override != null;
    let employee: Prisma.Decimal;
    if (override != null) {
      employee = D(override);
    } else if (rule.fixedAmount != null) {
      employee = D(rule.fixedAmount);
    } else {
      employee = basis.times(D(rule.employeeRatePct)).dividedBy(100);
      if (rule.minAmount != null && employee.lessThan(rule.minAmount)) employee = D(rule.minAmount);
    }
    // A deduction can never take more than there is. Net pay below zero is a
    // debt, which a payslip has nowhere to record.
    employee = Prisma.Decimal.min(two(employee), gross.minus(deductions));
    const employer = two(basis.times(D(rule.employerRatePct)).dividedBy(100));
    applied.push({ rule, employee, employer, basis, employeeSide });
    deductions = deductions.plus(employee);
    employerCosts = employerCosts.plus(employer);
    return employee;
  };

  for (const rule of active.filter((r) => r.reducesTaxable)) {
    taxable = taxable.minus(apply(rule, taxable));
  }

  // PAYE on what is left after the pre-tax deductions.
  const paye = two(computePaye(taxable, scheme.payeBands));
  deductions = deductions.plus(paye);

  // Pass 2: everything else.
  for (const rule of active.filter((r) => !r.reducesTaxable)) {
    apply(rule, taxable);
  }

  // Lines, in scheme order, PAYE placed after the pre-tax group it depends on.
  for (const a of applied.filter((x) => x.rule.reducesTaxable && x.employeeSide)) {
    lines.push({ kind: "DEDUCTION", code: a.rule.code, label: a.rule.label, amount: a.employee, basis: two(a.basis), ratePct: D(a.rule.employeeRatePct), sortOrder: order++ });
  }
  lines.push({ kind: "DEDUCTION", code: "PAYE", label: "PAYE income tax", amount: paye, basis: two(taxable), sortOrder: order++ });
  for (const a of applied.filter((x) => !x.rule.reducesTaxable && x.employeeSide)) {
    lines.push({ kind: "DEDUCTION", code: a.rule.code, label: a.rule.label, amount: a.employee, basis: two(a.basis), ratePct: D(a.rule.employeeRatePct), sortOrder: order++ });
  }
  for (const a of applied.filter((x) => x.employer.greaterThan(0))) {
    lines.push({ kind: "EMPLOYER", code: `${a.rule.code}_EMPLOYER`, label: `${a.rule.label} (employer)`, amount: a.employer, basis: two(a.basis), ratePct: D(a.rule.employerRatePct), sortOrder: order++ });
  }

  return {
    basic: two(basic),
    allowances: two(allowances),
    overtimePay: two(overtimePay),
    gross: two(gross),
    taxable: two(taxable),
    paye,
    deductions: two(deductions),
    employerCosts: two(employerCosts),
    net: two(gross.minus(deductions)),
    lines,
  };
}
