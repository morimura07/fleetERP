import { Prisma } from "@prisma/client";
import type { ExpenseKind, FuelUnit } from "@prisma/client";

/**
 * Rules that only make sense once a cost has a type.
 *
 * The detail groups on ExpenseLine are all nullable, because one table serves
 * six kinds. What stops that becoming a free-for-all is here: which fields a
 * kind requires, and which it must not carry.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface ExpenseLineDetail {
  kind: ExpenseKind;
  amount: Prisma.Decimal.Value;
  fuelVolume?: Prisma.Decimal.Value | null;
  fuelUnit?: FuelUnit | null;
  ratePerUnit?: Prisma.Decimal.Value | null;
  travelDays?: number | null;
  advanceDeducted?: Prisma.Decimal.Value | null;
  partsCost?: Prisma.Decimal.Value | null;
  labourCost?: Prisma.Decimal.Value | null;
  agreedRate?: Prisma.Decimal.Value | null;
}

/**
 * How far a fuel line's volume times its rate may drift from its total.
 *
 * Not zero: pumps round, and a receipt is often keyed from a printed total that
 * was itself rounded. One percent catches a transposed digit or a volume that
 * never went into the tank, without flagging every honest fill.
 */
export const FUEL_RECONCILIATION_TOLERANCE = 0.01;

export interface FuelCheck {
  /** What volume x rate comes to. Null when either is missing. */
  expected: Prisma.Decimal | null;
  /** Signed difference: amount − expected. Positive means overcharged. */
  variance: Prisma.Decimal | null;
  variancePct: number | null;
  /** True when the gap exceeds the tolerance and is worth a human look. */
  suspicious: boolean;
}

/**
 * Reconcile a fuel line's volume and rate against what was actually claimed.
 *
 * Fuel is the largest controllable cost in road freight and the easiest to
 * inflate, so the two figures are stored separately and compared rather than
 * one being derived from the other. This is what the pilferage and variance
 * report in the requirements is built on.
 */
export function checkFuelLine(line: ExpenseLineDetail): FuelCheck {
  const none: FuelCheck = { expected: null, variance: null, variancePct: null, suspicious: false };
  if (line.kind !== "FUEL") return none;
  if (line.fuelVolume == null || line.ratePerUnit == null) return none;

  const volume = D(line.fuelVolume);
  const rate = D(line.ratePerUnit);
  if (volume.lessThanOrEqualTo(0) || rate.lessThanOrEqualTo(0)) return none;

  const expected = volume.times(rate).toDecimalPlaces(2);
  const amount = D(line.amount);
  const variance = amount.minus(expected);
  if (expected.lessThanOrEqualTo(0)) return { expected, variance, variancePct: null, suspicious: false };

  const pct = variance.dividedBy(expected).times(100).toNumber();
  return {
    expected,
    variance,
    variancePct: Math.round(pct * 10) / 10,
    suspicious: Math.abs(variance.dividedBy(expected).toNumber()) > FUEL_RECONCILIATION_TOLERANCE,
  };
}

export interface KindIssue {
  field: string;
  message: string;
}

/** Fields each kind carries, so a line cannot hold another kind's detail. */
const FIELDS_BY_KIND: Record<ExpenseKind, string[]> = {
  GENERAL: [],
  FUEL: ["fuelVolume", "fuelUnit", "fuelCardNumber", "fuelStation", "ratePerUnit"],
  TOLL_PERMIT: ["gateLocation", "permitType"],
  REPAIR: ["serviceOrderId", "partsCost", "labourCost"],
  PER_DIEM: ["travelDays", "mealAllowance", "lodgingAllowance", "advanceDeducted"],
  SUBCONTRACT: ["carrierVendorId", "bolReference", "agreedRate"],
};

/** Detail a kind cannot do without, beyond what every line already requires. */
const REQUIRED_BY_KIND: Partial<Record<ExpenseKind, string[]>> = {
  // Without these two a fuel line cannot be reconciled or reported on per
  // litre, which is the only reason to mark it as fuel rather than general.
  FUEL: ["fuelVolume", "ratePerUnit"],
  PER_DIEM: ["travelDays"],
  SUBCONTRACT: ["carrierVendorId"],
};

/**
 * Everything wrong with one line, given its kind.
 *
 * Returns a list rather than throwing on the first problem, so a form can mark
 * every offending field at once.
 */
export function validateExpenseKind(
  line: ExpenseLineDetail & Record<string, unknown>,
): KindIssue[] {
  const issues: KindIssue[] = [];
  const present = (f: string) => line[f] !== undefined && line[f] !== null && line[f] !== "";

  for (const field of REQUIRED_BY_KIND[line.kind] ?? []) {
    if (!present(field)) issues.push({ field, message: `Required for a ${label(line.kind)} cost` });
  }

  // Detail belonging to a different kind is a sign the type was changed after
  // the fact; carrying it silently would corrupt any report that trusts `kind`.
  const allowed = new Set(FIELDS_BY_KIND[line.kind]);
  for (const [kind, fields] of Object.entries(FIELDS_BY_KIND) as [ExpenseKind, string[]][]) {
    if (kind === line.kind) continue;
    for (const field of fields) {
      if (!allowed.has(field) && present(field)) {
        issues.push({ field, message: `Only a ${label(kind)} cost carries this` });
      }
    }
  }

  if (line.kind === "PER_DIEM" && line.travelDays != null && line.travelDays <= 0) {
    issues.push({ field: "travelDays", message: "Travel days must be at least 1" });
  }

  // An advance recovered for more than the claim turns a reimbursement into a
  // debt, which this system has nowhere to put.
  if (line.advanceDeducted != null && D(line.advanceDeducted).greaterThan(D(line.amount))) {
    issues.push({ field: "advanceDeducted", message: "Cannot deduct more than the line is worth" });
  }

  if (line.kind === "REPAIR") {
    const parts = line.partsCost == null ? null : D(line.partsCost);
    const labour = line.labourCost == null ? null : D(line.labourCost);
    if (parts && labour && parts.plus(labour).greaterThan(D(line.amount))) {
      issues.push({ field: "partsCost", message: "Parts and labour together exceed the line total" });
    }
  }

  return issues;
}

export function label(kind: ExpenseKind): string {
  switch (kind) {
    case "FUEL": return "fuel";
    case "TOLL_PERMIT": return "toll or permit";
    case "REPAIR": return "repair";
    case "PER_DIEM": return "per-diem";
    case "SUBCONTRACT": return "subcontracted transport";
    default: return "general";
  }
}
