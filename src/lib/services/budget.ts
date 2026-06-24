import { Prisma, BudgetControl } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/errors";

/**
 * Budgeting (M3).
 *
 * A budget line carries an `amount` (ceiling) and `consumed` (posted-to-date) for
 * a cost center + GL account. When a financial posting would push consumed past
 * the ceiling, the budget's control behavior decides the outcome:
 *   - STRICT_BLOCK  → reject (422)
 *   - WARNING_ONLY  → allow, return a warning
 *   - OVERRIDE      → allow only when an explicit director override is supplied
 *
 * `checkBudget` is the pure decision; `consume` persists the spend atomically.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface BudgetDecision {
  allowed: boolean;
  warning: string | null;
  remaining: string; // remaining budget after this posting (may be negative)
}

/** Pure budget-control decision for a single line. */
export function checkBudget(
  control: BudgetControl,
  amount: Prisma.Decimal,
  consumed: Prisma.Decimal,
  posting: Prisma.Decimal.Value,
  override = false,
): BudgetDecision {
  const newConsumed = consumed.plus(posting);
  const remaining = amount.minus(newConsumed);
  const exceeds = remaining.isNegative();

  if (!exceeds) return { allowed: true, warning: null, remaining: remaining.toFixed(2) };

  const over = remaining.abs().toFixed(2);
  switch (control) {
    case "STRICT_BLOCK":
      return { allowed: false, warning: `Budget exceeded by ${over}`, remaining: remaining.toFixed(2) };
    case "OVERRIDE":
      return {
        allowed: override,
        warning: override ? `Override applied; over budget by ${over}` : `Over budget by ${over} — director override required`,
        remaining: remaining.toFixed(2),
      };
    case "WARNING_ONLY":
    default:
      return { allowed: true, warning: `Over budget by ${over}`, remaining: remaining.toFixed(2) };
  }
}

/**
 * Evaluate and (if allowed) record spend against the active budget line for an
 * account + cost center in a fiscal year. No matching line ⇒ unconstrained
 * (allowed, no warning). Throws 422 when STRICT_BLOCK rejects.
 */
export async function consume(input: {
  dataAreaId: string;
  fiscalYear: number;
  accountCode: string;
  costCenter: string;
  amount: Prisma.Decimal.Value;
  override?: boolean;
}): Promise<BudgetDecision> {
  return prisma.$transaction(async (tx) => {
    const line = await tx.budgetLine.findFirst({
      where: {
        accountCode: input.accountCode,
        costCenter: input.costCenter,
        budget: { dataAreaId: input.dataAreaId, fiscalYear: input.fiscalYear, isActive: true },
      },
      include: { budget: { select: { control: true } } },
    });

    // No budget line governs this account/cost-center — nothing to constrain.
    if (!line) return { allowed: true, warning: null, remaining: "0.00" };

    const decision = checkBudget(
      line.budget.control,
      D(line.amount),
      D(line.consumed),
      input.amount,
      input.override ?? false,
    );

    if (!decision.allowed) {
      throw new AuthError(decision.warning ?? "Budget control rejected this posting", 422);
    }

    await tx.budgetLine.update({
      where: { id: line.id },
      data: { consumed: D(line.consumed).plus(input.amount).toString() },
    });

    return decision;
  });
}

export interface BudgetLineStatus {
  id: string;
  kind: string;
  costCenter: string;
  accountCode: string;
  amount: string;
  consumed: string;
  remaining: string;
  utilizationPct: number;
}

/** Per-line utilization for a budget (read model for the UI). */
export function lineStatus(line: {
  id: string;
  kind: string;
  costCenter: string;
  accountCode: string;
  amount: Prisma.Decimal;
  consumed: Prisma.Decimal;
}): BudgetLineStatus {
  const amount = D(line.amount);
  const consumed = D(line.consumed);
  const remaining = amount.minus(consumed);
  const utilizationPct = amount.greaterThan(0)
    ? Math.round(consumed.dividedBy(amount).times(100).toNumber())
    : 0;
  return {
    id: line.id,
    kind: line.kind,
    costCenter: line.costCenter,
    accountCode: line.accountCode,
    amount: amount.toFixed(2),
    consumed: consumed.toFixed(2),
    remaining: remaining.toFixed(2),
    utilizationPct,
  };
}
