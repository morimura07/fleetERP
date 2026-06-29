import { Prisma } from "@prisma/client";
import { prisma } from "@backend/prisma";
import { AuthError } from "@backend/errors";
import { createJournalEntry } from "@backend/services/ledger";

/**
 * Cash & Bank (M4).
 *
 * Driver disbursements (mobile money / bank) settle into the ledger:
 *   Dr <disbursement expense> / Cr <bank account's GL control account>
 *
 * A MoneyTransfer is created PENDING (mirroring an external M-Pesa/Airtel call)
 * and posted to the ledger only when it succeeds, matching the PRD's API
 * callback-status model (PENDING → SUCCESS | FAILED | TIMEOUT, PRD §5).
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

async function accountIdByCode(dataAreaId: string, code: string): Promise<string> {
  const a = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  if (!a) throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
  return a.id;
}

/**
 * Mark a PENDING transfer SUCCESS and post it to the ledger. Idempotent guard:
 * an already-settled transfer (with a journal entry) is rejected.
 *   Dr expenseCode / Cr bankAccount.glCode
 */
export async function settleTransfer(transferId: string, createdById?: string | null) {
  const transfer = await prisma.moneyTransfer.findUnique({
    where: { id: transferId },
    include: { bankAccount: { select: { glCode: true, dataAreaId: true } } },
  });
  if (!transfer) throw new AuthError("Transfer not found", 404);
  if (transfer.entryId || transfer.status === "SUCCESS") {
    throw new AuthError("This transfer has already been settled", 409);
  }

  const amount = D(transfer.amount);
  if (!amount.greaterThan(0)) throw new AuthError("Transfer amount is zero", 422);

  const dataAreaId = transfer.dataAreaId;
  const [expenseId, bankId] = await Promise.all([
    accountIdByCode(dataAreaId, transfer.expenseCode),
    accountIdByCode(dataAreaId, transfer.bankAccount.glCode),
  ]);

  const entry = await createJournalEntry(
    {
      dataAreaId,
      postingDate: transfer.transferredAt,
      currency: transfer.currency,
      memo: `Disbursement ${transfer.reference} (${transfer.type})`,
      lines: [
        { accountId: expenseId, debit: amount.toString(), memo: transfer.memo ?? transfer.type },
        { accountId: bankId, credit: amount.toString(), memo: "Cash/bank disbursement" },
      ],
      createdById,
    },
    { post: true },
  );

  await prisma.moneyTransfer.update({
    where: { id: transfer.id },
    data: { status: "SUCCESS", entryId: entry.id },
  });

  return entry;
}

/** Flag a PENDING transfer as FAILED or TIMEOUT (no ledger impact). */
export async function failTransfer(
  transferId: string,
  status: "FAILED" | "TIMEOUT",
  externalRef?: string,
) {
  const transfer = await prisma.moneyTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new AuthError("Transfer not found", 404);
  if (transfer.status === "SUCCESS") {
    throw new AuthError("A settled transfer cannot be failed", 409);
  }
  return prisma.moneyTransfer.update({
    where: { id: transferId },
    data: { status, externalRef: externalRef ?? transfer.externalRef },
  });
}

export interface BankBalance {
  bankAccountId: string;
  code: string;
  name: string;
  type: string;
  currency: string;
  disbursed: string; // Σ SUCCESS transfers out of this account
  pending: string; // Σ PENDING transfers
}

/** Outflow summary per bank account (disbursed vs still-pending). */
export async function bankBalances(dataAreaId = "HQ01"): Promise<BankBalance[]> {
  const accounts = await prisma.bankAccount.findMany({
    where: { dataAreaId, isActive: true },
    include: { transfers: { select: { amount: true, status: true } } },
    orderBy: { code: "asc" },
  });

  return accounts.map((a) => {
    let disbursed = new Prisma.Decimal(0);
    let pending = new Prisma.Decimal(0);
    for (const t of a.transfers) {
      if (t.status === "SUCCESS") disbursed = disbursed.plus(t.amount);
      else if (t.status === "PENDING") pending = pending.plus(t.amount);
    }
    return {
      bankAccountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      currency: a.currency,
      disbursed: disbursed.toFixed(2),
      pending: pending.toFixed(2),
    };
  });
}
