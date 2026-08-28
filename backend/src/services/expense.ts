import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { createJournalEntry } from "@backend/services/ledger";

/**
 * Expense management (M23) — trip cash-sheets / expense claims.
 *
 * A driver submits a claim of expense lines (each with an account + receipt
 * image), optionally against an advance they were given (a MoneyTransfer).
 *
 * Lifecycle:  DRAFT → SUBMITTED → APPROVED → POSTED  (or REJECTED)
 *
 * Posting reconciles the claim against the advance:
 *   Dr expense accounts (per line)     Σ line amounts (= total)
 *     Cr Driver Advances (1200)        min(total, advance)   — clears the advance
 *     Cr Accrued (2300)                total − advance        — top-up owed to driver
 *   (if advance > total, the surplus stays in Driver Advances = the driver owes it back)
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const DRIVER_ADVANCES = "1200"; // ASSET
const ACCRUED = "2300"; // LIABILITY (net owed to the driver)

export interface ReconResult {
  total: Prisma.Decimal;
  advance: Prisma.Decimal;
  clearedFromAdvance: Prisma.Decimal; // min(total, advance)
  topUpOwed: Prisma.Decimal; // total − advance, floored at 0 (owed to driver)
  returnedByDriver: Prisma.Decimal; // advance − total, floored at 0 (driver returns cash)
  reconciled: Prisma.Decimal; // total − advance (+ owed to driver, − driver returns)
}

/**
 * Pure reconciliation of a claim total against an advance amount.
 * Positive `reconciled` = the company still owes the driver; negative = the
 * driver must return unspent advance.
 */
export function reconcile(total: Prisma.Decimal.Value, advance: Prisma.Decimal.Value): ReconResult {
  const t = D(total);
  const a = D(advance);
  const cleared = Prisma.Decimal.min(t, a);
  const topUp = Prisma.Decimal.max(t.minus(a), new Prisma.Decimal(0));
  const returned = Prisma.Decimal.max(a.minus(t), new Prisma.Decimal(0));
  return { total: t, advance: a, clearedFromAdvance: cleared, topUpOwed: topUp, returnedByDriver: returned, reconciled: t.minus(a) };
}

async function accountId(dataAreaId: string, code: string): Promise<string> {
  const a = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  if (!a) throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
  return a.id;
}

async function nextClaimNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.expenseClaim.count({ where: { dataAreaId } });
  return `EXP-${String(n + 1).padStart(6, "0")}`;
}

export interface ClaimLineInput {
  expenseCode: string;
  description: string;
  amount: Prisma.Decimal.Value;
  incurredAt: Date;
  receiptUrl?: string | null;
  // Operational allocation (client amendments, Aug 2026).
  postingDate?: Date | null;
  voucherRef?: string | null;
  vehicleId?: string | null;
  tripId?: string | null;
  odometerKm?: number | null;
  taxAmount?: Prisma.Decimal.Value;
}

export interface CreateClaimInput {
  dataAreaId: string;
  driverId?: string | null;
  title: string;
  currency: string;
  advanceId?: string | null;
  costCenter?: string | null;
  branch?: string | null;
  lines: ClaimLineInput[];
  createdById?: string | null;
}

/** Create a DRAFT claim with its lines; total is derived. */
export async function createClaim(input: CreateClaimInput) {
  if (input.lines.length === 0) throw new AuthError("A claim needs at least one line", 422);
  const total = input.lines.reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
  const claimNumber = await nextClaimNumber(input.dataAreaId);

  return prisma.expenseClaim.create({
    data: {
      dataAreaId: input.dataAreaId,
      claimNumber,
      driverId: input.driverId ?? null,
      title: input.title,
      currency: input.currency,
      advanceId: input.advanceId ?? null,
      costCenter: input.costCenter ?? null,
      branch: input.branch ?? null,
      total: total.toFixed(2),
      createdById: input.createdById ?? null,
      lines: {
        create: input.lines.map((l) => ({
          expenseCode: l.expenseCode,
          description: l.description,
          amount: D(l.amount).toFixed(2),
          incurredAt: l.incurredAt,
          receiptUrl: l.receiptUrl ?? null,
          // Defaults to the date it was incurred, which is what a bookkeeper
          // expects unless the claim is posted into a later period.
          postingDate: l.postingDate ?? l.incurredAt,
          voucherRef: l.voucherRef ?? null,
          vehicleId: l.vehicleId ?? null,
          tripId: l.tripId ?? null,
          odometerKm: l.odometerKm ?? null,
          taxAmount: D(l.taxAmount ?? 0).toFixed(2),
        })),
      },
    },
    include: { lines: true },
  });
}

/** DRAFT → SUBMITTED. */
export async function submitClaim(id: string) {
  const claim = await prisma.expenseClaim.findUnique({ where: { id } });
  if (!claim) throw new AuthError("Expense claim not found", 404);
  if (claim.status !== "DRAFT") throw new AuthError("Only draft claims can be submitted", 409);
  return prisma.expenseClaim.update({ where: { id }, data: { status: "SUBMITTED" } });
}

/** SUBMITTED → APPROVED (or REJECTED). */
export async function reviewClaim(id: string, approve: boolean, reviewerId: string) {
  const claim = await prisma.expenseClaim.findUnique({ where: { id } });
  if (!claim) throw new AuthError("Expense claim not found", 404);
  if (claim.status !== "SUBMITTED") throw new AuthError("Only submitted claims can be reviewed", 409);
  return prisma.expenseClaim.update({
    where: { id },
    data: approve
      ? { status: "APPROVED", approvedById: reviewerId, approvedAt: new Date() }
      : { status: "REJECTED" },
  });
}

/**
 * Post an APPROVED claim: reconcile against its advance and post the entry.
 */
export async function postClaim(id: string, createdById?: string | null) {
  const claim = await prisma.expenseClaim.findUnique({ where: { id }, include: { lines: true, advance: true } });
  if (!claim) throw new AuthError("Expense claim not found", 404);
  if (claim.postingEntryId || claim.status !== "APPROVED") {
    throw new AuthError("Only approved, unposted claims can be posted", 409);
  }
  const total = D(claim.total);
  if (!total.greaterThan(0)) throw new AuthError("Claim total is zero", 422);

  const advanceAmount = claim.advance ? D(claim.advance.amount) : new Prisma.Decimal(0);
  const r = reconcile(total, advanceAmount);

  // Debit each expense line's account; credit the advance (cleared) + any top-up.
  const lineAccounts = await Promise.all(claim.lines.map((l) => accountId(claim.dataAreaId, l.expenseCode)));
  const debitLines = claim.lines.map((l, i) => ({
    accountId: lineAccounts[i],
    debit: D(l.amount).toString(),
    memo: l.description,
  }));

  const creditLines: { accountId: string; credit: string; memo?: string }[] = [];
  if (r.clearedFromAdvance.greaterThan(0)) {
    creditLines.push({ accountId: await accountId(claim.dataAreaId, DRIVER_ADVANCES), credit: r.clearedFromAdvance.toString(), memo: "Clear driver advance" });
  }
  if (r.topUpOwed.greaterThan(0)) {
    creditLines.push({ accountId: await accountId(claim.dataAreaId, ACCRUED), credit: r.topUpOwed.toString(), memo: "Top-up owed to driver" });
  }

  const entry = await createJournalEntry(
    {
      dataAreaId: claim.dataAreaId,
      postingDate: new Date(),
      currency: claim.currency,
      memo: `Expense claim ${claim.claimNumber}`,
      lines: [...debitLines, ...creditLines],
      createdById,
    },
    { post: true },
  );

  await prisma.expenseClaim.update({
    where: { id: claim.id },
    data: {
      status: "POSTED",
      postingEntryId: entry.id,
      advanceAmount: advanceAmount.toFixed(2),
      reconciled: r.reconciled.toFixed(2),
    },
  });
  return { entry, reconciliation: r };
}
