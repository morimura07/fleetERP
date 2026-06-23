import { Prisma, InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/errors";
import { createJournalEntry } from "@/lib/services/ledger";

/**
 * Accounts Payable (M1) & Accounts Receivable (M2) — invoice settlement into
 * the ledger.
 *
 *   AP bill posting:   Dr <expense> + Dr VAT Recoverable (1310?) / Cr A/P (2000)
 *                      − Cr Withholding Tax Payable (2110) when WHT applies.
 *     (Simplified: VAT input is folded into the expense unless a recoverable
 *      account is configured; WHT reduces the payable.)
 *   AP payment:        Dr A/P (2000) / Cr Bank (bankCode)
 *   AR invoice posting: Dr A/R (1100) / Cr <revenue> + Cr VAT Payable (2100)
 *   AR receipt:        Dr Bank (bankCode) / Cr A/R (1100)
 */

const ACCOUNTS_PAYABLE = "2000";
const ACCOUNTS_RECEIVABLE = "1100";
const VAT_PAYABLE = "2100";
const VAT_RECOVERABLE = "1310"; // optional; falls back to expense if absent
const WHT_PAYABLE = "2110";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

async function accountId(dataAreaId: string, code: string): Promise<string> {
  const a = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  if (!a) throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
  return a.id;
}

async function maybeAccountId(dataAreaId: string, code: string): Promise<string | null> {
  const a = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  return a?.id ?? null;
}

/** Next sequential invoice number for AR, e.g. AR-INV-000001. */
async function nextArNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.customerInvoice.count({ where: { dataAreaId } });
  return `AR-INV-${String(n + 1).padStart(6, "0")}`;
}

// ───────────────────────── Accounts Payable ─────────────────────────

/**
 * Post a vendor bill to the ledger and mark it POSTED.
 *   Dr expense (subtotal) + Dr VAT recoverable (if account exists, else into expense)
 *   Cr Accounts Payable (net) + Cr Withholding Tax Payable (wht)
 * Net payable = subtotal + vat − wht.
 */
export async function postVendorInvoice(invoiceId: string, createdById?: string | null) {
  const inv = await prisma.vendorInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new AuthError("Vendor invoice not found", 404);
  if (inv.postingEntryId || inv.status !== "DRAFT") {
    throw new AuthError("This bill has already been posted", 409);
  }

  const subtotal = D(inv.subtotal);
  const vat = D(inv.vatAmount);
  const wht = D(inv.whtAmount);
  const payable = subtotal.plus(vat).minus(wht); // = inv.total
  if (!payable.greaterThan(0)) throw new AuthError("Bill amount is zero", 422);

  const vatRecoverableId = vat.greaterThan(0)
    ? await maybeAccountId(inv.dataAreaId, VAT_RECOVERABLE)
    : null;

  const [expenseId, apId, whtId] = await Promise.all([
    accountId(inv.dataAreaId, inv.expenseCode),
    accountId(inv.dataAreaId, ACCOUNTS_PAYABLE),
    wht.greaterThan(0) ? accountId(inv.dataAreaId, WHT_PAYABLE) : Promise.resolve(""),
  ]);

  // If there is VAT but no recoverable account, fold it into the expense debit.
  const expenseDebit = vatRecoverableId ? subtotal : subtotal.plus(vat);

  const lines = [
    { accountId: expenseId, debit: expenseDebit.toString(), memo: `Bill ${inv.invoiceNumber}` },
    ...(vatRecoverableId
      ? [{ accountId: vatRecoverableId, debit: vat.toString(), memo: "VAT recoverable" }]
      : []),
    { accountId: apId, credit: payable.toString(), memo: "Accounts payable" },
    ...(wht.greaterThan(0)
      ? [{ accountId: whtId, credit: wht.toString(), memo: "Withholding tax" }]
      : []),
  ];

  const entry = await createJournalEntry(
    {
      dataAreaId: inv.dataAreaId,
      postingDate: new Date(),
      currency: inv.currency,
      memo: `AP bill ${inv.invoiceNumber}`,
      lines,
      createdById,
    },
    { post: true },
  );

  await prisma.vendorInvoice.update({
    where: { id: inv.id },
    data: { status: "POSTED", postingEntryId: entry.id },
  });
  return entry;
}

/** Record & post a payment against a posted AP bill: Dr A/P / Cr Bank. */
export async function payVendorInvoice(
  invoiceId: string,
  input: { amount: Prisma.Decimal.Value; paidAt: Date; bankCode: string; reference?: string },
  createdById?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.vendorInvoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new AuthError("Vendor invoice not found", 404);
    if (inv.status === "DRAFT") throw new AuthError("Post the bill before paying it", 409);
    if (inv.status === "PAID") throw new AuthError("This bill is already fully paid", 409);

    const amount = D(input.amount);
    const outstanding = D(inv.total).minus(inv.paidAmount);
    if (!amount.greaterThan(0)) throw new AuthError("Payment amount is zero", 422);
    if (amount.greaterThan(outstanding)) {
      throw new AuthError(`Payment exceeds the outstanding balance (${outstanding})`, 422);
    }

    const [apId, bankId] = await Promise.all([
      accountId(inv.dataAreaId, ACCOUNTS_PAYABLE),
      accountId(inv.dataAreaId, input.bankCode),
    ]);

    const entry = await createJournalEntry(
      {
        dataAreaId: inv.dataAreaId,
        postingDate: input.paidAt,
        currency: inv.currency,
        memo: `Payment for ${inv.invoiceNumber}`,
        lines: [
          { accountId: apId, debit: amount.toString(), memo: "A/P settlement" },
          { accountId: bankId, credit: amount.toString(), memo: "Bank" },
        ],
        createdById,
      },
      { post: true },
    );

    await tx.vendorPayment.create({
      data: {
        invoiceId: inv.id, amount: amount.toString(), paidAt: input.paidAt,
        bankCode: input.bankCode, reference: input.reference, entryId: entry.id,
      },
    });

    const newPaid = D(inv.paidAmount).plus(amount);
    const fullyPaid = newPaid.greaterThanOrEqualTo(inv.total);
    await tx.vendorInvoice.update({
      where: { id: inv.id },
      data: {
        paidAmount: newPaid.toString(),
        status: (fullyPaid ? "PAID" : "PARTIALLY_PAID") as InvoiceStatus,
      },
    });
    return entry;
  });
}

// ───────────────────────── Accounts Receivable ─────────────────────────

/**
 * Post an AR invoice to the ledger and mark it POSTED.
 *   Dr Accounts Receivable (total) / Cr <revenue> (subtotal) + Cr VAT Payable (vat)
 */
export async function postCustomerInvoice(invoiceId: string, createdById?: string | null) {
  const inv = await prisma.customerInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new AuthError("Customer invoice not found", 404);
  if (inv.postingEntryId || inv.status !== "DRAFT") {
    throw new AuthError("This invoice has already been posted", 409);
  }

  const subtotal = D(inv.subtotal);
  const vat = D(inv.vatAmount);
  const total = subtotal.plus(vat); // = inv.total
  if (!total.greaterThan(0)) throw new AuthError("Invoice amount is zero", 422);

  const [arId, revenueId, vatId] = await Promise.all([
    accountId(inv.dataAreaId, ACCOUNTS_RECEIVABLE),
    accountId(inv.dataAreaId, inv.revenueCode),
    vat.greaterThan(0) ? accountId(inv.dataAreaId, VAT_PAYABLE) : Promise.resolve(""),
  ]);

  const lines = [
    { accountId: arId, debit: total.toString(), memo: `Invoice ${inv.invoiceNumber}` },
    { accountId: revenueId, credit: subtotal.toString(), memo: "Revenue" },
    ...(vat.greaterThan(0)
      ? [{ accountId: vatId, credit: vat.toString(), memo: "VAT payable" }]
      : []),
  ];

  const entry = await createJournalEntry(
    {
      dataAreaId: inv.dataAreaId,
      postingDate: new Date(),
      currency: inv.currency,
      memo: `AR invoice ${inv.invoiceNumber}`,
      lines,
      createdById,
    },
    { post: true },
  );

  await prisma.customerInvoice.update({
    where: { id: inv.id },
    data: { status: "POSTED", postingEntryId: entry.id },
  });
  return entry;
}

/** Record & post a receipt against a posted AR invoice: Dr Bank / Cr A/R. */
export async function receiveCustomerInvoice(
  invoiceId: string,
  input: { amount: Prisma.Decimal.Value; receivedAt: Date; bankCode: string; reference?: string },
  createdById?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.customerInvoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new AuthError("Customer invoice not found", 404);
    if (inv.status === "DRAFT") throw new AuthError("Post the invoice before recording a receipt", 409);
    if (inv.status === "PAID") throw new AuthError("This invoice is already fully settled", 409);

    const amount = D(input.amount);
    const outstanding = D(inv.total).minus(inv.paidAmount);
    if (!amount.greaterThan(0)) throw new AuthError("Receipt amount is zero", 422);
    if (amount.greaterThan(outstanding)) {
      throw new AuthError(`Receipt exceeds the outstanding balance (${outstanding})`, 422);
    }

    const [arId, bankId] = await Promise.all([
      accountId(inv.dataAreaId, ACCOUNTS_RECEIVABLE),
      accountId(inv.dataAreaId, input.bankCode),
    ]);

    const entry = await createJournalEntry(
      {
        dataAreaId: inv.dataAreaId,
        postingDate: input.receivedAt,
        currency: inv.currency,
        memo: `Receipt for ${inv.invoiceNumber}`,
        lines: [
          { accountId: bankId, debit: amount.toString(), memo: "Bank" },
          { accountId: arId, credit: amount.toString(), memo: "A/R settlement" },
        ],
        createdById,
      },
      { post: true },
    );

    await tx.customerReceipt.create({
      data: {
        invoiceId: inv.id, amount: amount.toString(), receivedAt: input.receivedAt,
        bankCode: input.bankCode, reference: input.reference, entryId: entry.id,
      },
    });

    const newPaid = D(inv.paidAmount).plus(amount);
    const fullyPaid = newPaid.greaterThanOrEqualTo(inv.total);
    await tx.customerInvoice.update({
      where: { id: inv.id },
      data: {
        paidAmount: newPaid.toString(),
        status: (fullyPaid ? "PAID" : "PARTIALLY_PAID") as InvoiceStatus,
      },
    });
    return entry;
  });
}

// ───────────────────────── Helpers ─────────────────────────

export function nextArInvoiceNumber(dataAreaId: string) {
  return nextArNumber(dataAreaId);
}

/** AP bill total = subtotal + vat − wht. Pure; used at create time. */
export function vendorInvoiceTotal(
  subtotal: Prisma.Decimal.Value,
  vat: Prisma.Decimal.Value,
  wht: Prisma.Decimal.Value,
): Prisma.Decimal {
  return new Prisma.Decimal(subtotal).plus(vat).minus(wht);
}

/** AR invoice total = subtotal + vat. Pure; used at create time. */
export function customerInvoiceTotal(
  subtotal: Prisma.Decimal.Value,
  vat: Prisma.Decimal.Value,
): Prisma.Decimal {
  return new Prisma.Decimal(subtotal).plus(vat);
}

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";

/** Classify an outstanding invoice by days overdue (PRD M7 aging buckets). */
export function agingBucket(dueDate: Date | null, asOf: Date = new Date()): AgingBucket {
  if (!dueDate) return "current";
  const days = Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}
