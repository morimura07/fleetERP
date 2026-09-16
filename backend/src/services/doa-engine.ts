import { Prisma } from "@prisma/client";
import type { DoaMode, DecisionStatus } from "@prisma/client";

/**
 * The delegation-of-authority matrix as pure functions.
 *
 * A tier is a band of value with the roles that must sign; the matrix is
 * data the customer edits. Given an amount in the tier currency this picks
 * the tier, lays out the signatures it needs, works out what a set of
 * decisions adds up to, and says whether a change order is big enough to
 * send a subject back through the matrix.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface TierLike {
  id: string;
  name: string;
  minAmount: Prisma.Decimal.Value;
  maxAmount: Prisma.Decimal.Value | null;
  approverRoles: string[];
  mode: DoaMode;
  minSignatures: number;
  sortOrder: number;
  isActive: boolean;
}

/**
 * The tier a value falls in: the lowest-ordered active tier whose band
 * contains it. Bands are [min, max]; a null max is open-ended. Null when no
 * tier covers the amount, which the caller must treat as "cannot be
 * approved", not "needs no approval".
 */
export function tierFor(amountBase: Prisma.Decimal.Value, tiers: TierLike[]): TierLike | null {
  const amt = D(amountBase);
  const candidates = tiers
    .filter((t) => t.isActive && amt.greaterThanOrEqualTo(t.minAmount) && (t.maxAmount == null || amt.lessThanOrEqualTo(t.maxAmount)))
    .sort((a, b) => a.sortOrder - b.sortOrder || D(a.minAmount).comparedTo(b.minAmount));
  return candidates[0] ?? null;
}

/**
 * Gaps and overlaps in a matrix, so the settings screen can say what is
 * wrong before a requisition finds out. Sorted by min; a gap between one
 * tier's max and the next tier's min leaves amounts nobody can approve.
 */
export function matrixProblems(tiers: TierLike[]): string[] {
  const active = tiers.filter((t) => t.isActive).sort((a, b) => D(a.minAmount).comparedTo(b.minAmount));
  const out: string[] = [];
  if (active.length === 0) return ["No active tiers: nothing can be approved."];
  if (!D(active[0].minAmount).isZero()) out.push(`Amounts below ${D(active[0].minAmount).toFixed(2)} fall in no tier.`);
  for (let i = 0; i < active.length; i++) {
    const t = active[i];
    if (t.approverRoles.length === 0) out.push(`${t.name}: no approver roles.`);
    if (t.minSignatures > t.approverRoles.length && t.approverRoles.length > 0) out.push(`${t.name}: needs ${t.minSignatures} signatures but lists ${t.approverRoles.length} roles.`);
    if (t.maxAmount != null && D(t.maxAmount).lessThan(t.minAmount)) out.push(`${t.name}: maximum is below its minimum.`);
    const next = active[i + 1];
    if (next) {
      if (t.maxAmount == null) out.push(`${t.name} has no ceiling but ${next.name} starts above it.`);
      else if (D(next.minAmount).greaterThan(D(t.maxAmount).plus("0.01"))) out.push(`Gap between ${t.name} (to ${D(t.maxAmount).toFixed(2)}) and ${next.name} (from ${D(next.minAmount).toFixed(2)}).`);
      else if (D(next.minAmount).lessThanOrEqualTo(t.maxAmount)) out.push(`${t.name} and ${next.name} overlap; the lower-ordered one wins.`);
    }
  }
  if (active[active.length - 1].maxAmount != null) out.push(`Amounts above ${D(active[active.length - 1].maxAmount!).toFixed(2)} fall in no tier.`);
  return out;
}

export interface PlannedDecision {
  step: number;
  roleKey: string;
}

/** The signatures a tier needs, in the order it wants them. */
export function planDecisions(tier: TierLike): PlannedDecision[] {
  return tier.approverRoles.map((roleKey, i) => ({ step: tier.mode === "SEQUENTIAL" ? i + 1 : 1, roleKey }));
}

export interface DecisionLike {
  step: number;
  roleKey: string;
  status: DecisionStatus;
}

export type RequestOutcome = "PENDING" | "APPROVED" | "REJECTED";

/**
 * What a set of decisions adds up to. A rejection anywhere rejects the
 * request. Otherwise: ANY needs one approval; PARALLEL and SEQUENTIAL need
 * `minSignatures` approvals, capped at the number of roles.
 */
export function outcome(tier: Pick<TierLike, "mode" | "minSignatures" | "approverRoles">, decisions: DecisionLike[]): RequestOutcome {
  if (decisions.some((d) => d.status === "REJECTED")) return "REJECTED";
  const approved = decisions.filter((d) => d.status === "APPROVED").length;
  const needed = tier.mode === "ANY" ? 1 : Math.max(1, Math.min(tier.minSignatures, tier.approverRoles.length));
  return approved >= needed ? "APPROVED" : "PENDING";
}

/**
 * The decisions a user may sign now. In SEQUENTIAL mode only the lowest
 * pending step is open; elsewhere every pending one is. A user holds the
 * roles given (their custom role key and their system role).
 */
export function openDecisionsFor(tier: Pick<TierLike, "mode">, decisions: (DecisionLike & { id: string })[], userRoles: string[]): (DecisionLike & { id: string })[] {
  const pending = decisions.filter((d) => d.status === "PENDING");
  if (pending.length === 0) return [];
  const lowest = Math.min(...pending.map((d) => d.step));
  const open = tier.mode === "SEQUENTIAL" ? pending.filter((d) => d.step === lowest) : pending;
  return open.filter((d) => userRoles.includes(d.roleKey));
}

/**
 * Whether a change from one amount to another re-opens the matrix: when it
 * moves the subject into a different tier, or exceeds the policy's variance
 * in percent or in money. A decrease that stays in tier does not.
 */
export function needsRetrigger(
  oldAmountBase: Prisma.Decimal.Value,
  newAmountBase: Prisma.Decimal.Value,
  tiers: TierLike[],
  policy: { retriggerVariancePct: Prisma.Decimal.Value; retriggerVarianceAmount: Prisma.Decimal.Value },
): { retrigger: boolean; reason: string | null } {
  const oldA = D(oldAmountBase);
  const newA = D(newAmountBase);
  if (newA.equals(oldA)) return { retrigger: false, reason: null };
  const oldTier = tierFor(oldA, tiers);
  const newTier = tierFor(newA, tiers);
  if (oldTier?.id !== newTier?.id) {
    return { retrigger: true, reason: `moves from ${oldTier?.name ?? "no tier"} to ${newTier?.name ?? "no tier"}` };
  }
  const diff = newA.minus(oldA);
  if (diff.lessThanOrEqualTo(0)) return { retrigger: false, reason: null };
  const pct = oldA.isZero() ? D(100) : diff.dividedBy(oldA).times(100);
  const pctLimit = D(policy.retriggerVariancePct);
  const amtLimit = D(policy.retriggerVarianceAmount);
  if (pctLimit.greaterThan(0) && pct.greaterThan(pctLimit)) {
    return { retrigger: true, reason: `increase of ${pct.toDecimalPlaces(1)}% exceeds ${pctLimit}%` };
  }
  if (amtLimit.greaterThan(0) && diff.greaterThan(amtLimit)) {
    return { retrigger: true, reason: `increase of ${diff.toFixed(2)} exceeds ${amtLimit.toFixed(2)}` };
  }
  return { retrigger: false, reason: null };
}

export interface SeedTier extends Omit<TierLike, "id"> {
  requiresBudgetSignOff?: boolean;
  requiresBidSummary?: boolean;
  autoRelease?: boolean;
}

/**
 * The document's matrix, in USD, as the starting settings for a new
 * company. The role keys are the customer's to create (Priyam: "these are
 * roles a customer can create"); until they exist nobody holds them and the
 * settings screen says so.
 */
export const DEFAULT_TIERS: SeedTier[] = [
  { name: "Under 5,000", minAmount: 0, maxAmount: 5000, approverRoles: ["PROCUREMENT_HEAD"], mode: "ANY", minSignatures: 1, sortOrder: 1, isActive: true, autoRelease: true },
  { name: "5,001 to 25,000", minAmount: 5000.01, maxAmount: 25000, approverRoles: ["PROCUREMENT_HEAD", "FINANCE_HEAD"], mode: "PARALLEL", minSignatures: 2, sortOrder: 2, isActive: true, requiresBudgetSignOff: true },
  { name: "25,001 to 100,000", minAmount: 25000.01, maxAmount: 100000, approverRoles: ["CEO"], mode: "ANY", minSignatures: 1, sortOrder: 3, isActive: true, requiresBidSummary: true },
  { name: "Above 100,000", minAmount: 100000.01, maxAmount: null, approverRoles: ["CEO", "BOARD"], mode: "PARALLEL", minSignatures: 2, sortOrder: 4, isActive: true, requiresBidSummary: true },
];
