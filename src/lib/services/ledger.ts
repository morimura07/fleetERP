import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/errors";

/**
 * Double-entry ledger core.
 *
 * The accounting invariant — SUM(debit) === SUM(credit) and every amount ≥ 0
 * with at most one side per line — lives here as a pure predicate so it is
 * trivial to unit test, independent of Prisma/Next. The mutating helpers
 * (post / reverse) wrap it and persist atomically.
 *
 * Amounts use Prisma.Decimal throughout; never use JS numbers for money.
 */

export interface LineInput {
  accountId: string;
  debit?: Prisma.Decimal.Value;
  credit?: Prisma.Decimal.Value;
  memo?: string | null;
  dimension?: string | null;
}

export interface BalanceResult {
  balanced: boolean;
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
}

const D = (v: Prisma.Decimal.Value | undefined) => new Prisma.Decimal(v ?? 0);

/**
 * Validate the shape of a set of journal lines:
 *   - at least two lines,
 *   - every debit/credit ≥ 0,
 *   - each line has exactly one non-zero side (a debit XOR a credit),
 *   - SUM(debit) === SUM(credit).
 * Returns the totals so callers can surface the imbalance.
 */
export function checkBalanced(lines: LineInput[]): BalanceResult {
  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);

  for (const line of lines) {
    const debit = D(line.debit);
    const credit = D(line.credit);
    if (debit.isNegative() || credit.isNegative()) {
      return { balanced: false, totalDebit, totalCredit };
    }
    // Exactly one side must be non-zero.
    const debitNonZero = !debit.isZero();
    const creditNonZero = !credit.isZero();
    if (debitNonZero === creditNonZero) {
      return { balanced: false, totalDebit, totalCredit };
    }
    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
  }

  const balanced =
    lines.length >= 2 &&
    totalDebit.equals(totalCredit) &&
    totalDebit.greaterThan(0);

  return { balanced, totalDebit, totalCredit };
}

/** Next voucher number for an entity, of the form "JV-000001". */
export async function nextVoucherNumber(
  tx: Prisma.TransactionClient,
  dataAreaId: string,
): Promise<string> {
  const count = await tx.journalEntry.count({ where: { dataAreaId } });
  return `JV-${String(count + 1).padStart(6, "0")}`;
}

export interface CreateEntryInput {
  dataAreaId: string;
  postingDate: Date;
  currency: string;
  exchangeRate?: Prisma.Decimal.Value;
  memo?: string | null;
  lines: LineInput[];
  createdById?: string | null;
}

/**
 * Create a balanced journal entry. `post` decides DRAFT vs POSTED.
 * Throws AuthError(422) if the lines do not balance, or AuthError(404) if any
 * referenced account does not exist in the same legal entity.
 */
export async function createJournalEntry(
  input: CreateEntryInput,
  opts: { post: boolean } = { post: false },
) {
  const balance = checkBalanced(input.lines);
  if (!balance.balanced) {
    throw new AuthError(
      `Debits and credits do not balance (Dr ${balance.totalDebit} / Cr ${balance.totalCredit})`,
      422,
    );
  }

  return prisma.$transaction(async (tx) => {
    // All accounts must belong to the same legal entity and be active.
    const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
    const accounts = await tx.account.findMany({
      where: { id: { in: accountIds }, dataAreaId: input.dataAreaId, isActive: true },
      select: { id: true },
    });
    if (accounts.length !== accountIds.length) {
      throw new AuthError("Contains a missing or inactive account", 404);
    }

    const voucherNumber = await nextVoucherNumber(tx, input.dataAreaId);

    return tx.journalEntry.create({
      data: {
        dataAreaId: input.dataAreaId,
        voucherNumber,
        postingDate: input.postingDate,
        currency: input.currency,
        exchangeRate: new Prisma.Decimal(input.exchangeRate ?? 1),
        memo: input.memo ?? null,
        status: opts.post ? "POSTED" : "DRAFT",
        postedAt: opts.post ? new Date() : null,
        createdById: input.createdById ?? null,
        lines: {
          create: input.lines.map((l) => ({
            accountId: l.accountId,
            debit: new Prisma.Decimal(l.debit ?? 0),
            credit: new Prisma.Decimal(l.credit ?? 0),
            memo: l.memo ?? null,
            dimension: l.dimension ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  });
}

/** Transition a DRAFT entry to POSTED. Idempotent guards reject other states. */
export async function postJournalEntry(id: string) {
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!entry) throw new AuthError("Journal entry not found", 404);
  if (entry.status !== "DRAFT") {
    throw new AuthError("Only draft entries can be posted", 409);
  }
  // Re-validate at post time — lines may have been edited while in DRAFT.
  if (!checkBalanced(entry.lines).balanced) {
    throw new AuthError("Cannot post: debits and credits do not balance", 422);
  }
  return prisma.journalEntry.update({
    where: { id },
    data: { status: "POSTED", postedAt: new Date() },
    include: { lines: true },
  });
}

/**
 * Reverse a POSTED entry by creating a contra-entry (debits and credits
 * swapped) and marking the original REVERSED. Posted entries are never edited
 * or deleted, satisfying the immutable-audit requirement (PRD §7).
 */
export async function reverseJournalEntry(id: string, createdById?: string | null) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!original) throw new AuthError("Journal entry not found", 404);
    if (original.status !== "POSTED") {
      throw new AuthError("Only posted entries can be reversed", 409);
    }

    const voucherNumber = await nextVoucherNumber(tx, original.dataAreaId);
    const reversal = await tx.journalEntry.create({
      data: {
        dataAreaId: original.dataAreaId,
        voucherNumber,
        postingDate: new Date(),
        currency: original.currency,
        exchangeRate: original.exchangeRate,
        memo: `Reversal of ${original.voucherNumber}`,
        status: "POSTED",
        postedAt: new Date(),
        reversalOfId: original.id,
        createdById: createdById ?? null,
        lines: {
          create: original.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.credit, // swap
            credit: l.debit,
            memo: l.memo,
            dimension: l.dimension,
          })),
        },
      },
      include: { lines: true },
    });

    await tx.journalEntry.update({
      where: { id: original.id },
      data: { status: "REVERSED" },
    });

    return reversal;
  });
}
