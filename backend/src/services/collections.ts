import { Prisma, DunningLevel, DisputeStatus, CollectionActivityType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { createJournalEntry } from "@backend/services/ledger";
import { agingBucket, type AgingBucket } from "@backend/services/ap-ar";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const AR = "1100"; // Accounts Receivable (control)
const BAD_DEBT = "6200"; // Bad Debt Expense

/**
 * Credit & Collections (M7) — accounts-receivable aging.
 *
 * For every POSTED / PARTIALLY_PAID customer invoice with an outstanding
 * balance (total − paidAmount > 0), classify the balance into an aging bucket
 * by days past its due date, and roll up totals overall and per customer.
 */

export interface AgingTotals {
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
  total: string;
}

export interface CustomerAging extends AgingTotals {
  customerId: string;
  customerCode: string;
  customerName: string;
  currency: string;
  invoiceCount: number;
}

export interface AgingReport {
  asOf: string;
  totals: AgingTotals;
  customers: CustomerAging[];
}

const BUCKETS: AgingBucket[] = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"];

function emptyTotals(): Record<AgingBucket, Prisma.Decimal> {
  return {
    current: new Prisma.Decimal(0),
    d1_30: new Prisma.Decimal(0),
    d31_60: new Prisma.Decimal(0),
    d61_90: new Prisma.Decimal(0),
    d90_plus: new Prisma.Decimal(0),
  };
}

function serialize(t: Record<AgingBucket, Prisma.Decimal>): AgingTotals {
  const total = BUCKETS.reduce((s, b) => s.plus(t[b]), new Prisma.Decimal(0));
  return {
    current: t.current.toFixed(2),
    d1_30: t.d1_30.toFixed(2),
    d31_60: t.d31_60.toFixed(2),
    d61_90: t.d61_90.toFixed(2),
    d90_plus: t.d90_plus.toFixed(2),
    total: total.toFixed(2),
  };
}

export async function computeAgingReport(
  asOf: Date = new Date(),
  dataAreaId = "HQ01",
): Promise<AgingReport> {
  const invoices = await prisma.customerInvoice.findMany({
    where: { dataAreaId, status: { in: ["POSTED", "PARTIALLY_PAID"] } },
    select: {
      total: true,
      paidAmount: true,
      dueDate: true,
      currency: true,
      customer: { select: { id: true, code: true, name: true } },
    },
  });

  const grand = emptyTotals();
  const byCustomer = new Map<
    string,
    { meta: { code: string; name: string; currency: string }; buckets: Record<AgingBucket, Prisma.Decimal>; count: number }
  >();

  for (const inv of invoices) {
    const outstanding = new Prisma.Decimal(inv.total).minus(inv.paidAmount);
    if (!outstanding.greaterThan(0)) continue;

    const bucket = agingBucket(inv.dueDate, asOf);
    grand[bucket] = grand[bucket].plus(outstanding);

    const id = inv.customer.id;
    if (!byCustomer.has(id)) {
      byCustomer.set(id, {
        meta: { code: inv.customer.code, name: inv.customer.name, currency: inv.currency },
        buckets: emptyTotals(),
        count: 0,
      });
    }
    const row = byCustomer.get(id)!;
    row.buckets[bucket] = row.buckets[bucket].plus(outstanding);
    row.count += 1;
  }

  const customers: CustomerAging[] = [...byCustomer.entries()]
    .map(([customerId, { meta, buckets, count }]) => ({
      customerId,
      customerCode: meta.code,
      customerName: meta.name,
      currency: meta.currency,
      invoiceCount: count,
      ...serialize(buckets),
    }))
    .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

  return {
    asOf: asOf.toISOString().slice(0, 10),
    totals: serialize(grand),
    customers,
  };
}

// ── Credit exposure & available credit (spec: Collections §2) ───────────────

/** Available credit = effective limit − exposure, floored at 0. Pure — unit-tested. */
export function availableCredit(
  creditLimit: Prisma.Decimal.Value,
  tempCreditLimit: Prisma.Decimal.Value | null,
  exposure: Prisma.Decimal.Value,
): Prisma.Decimal {
  const effective = tempCreditLimit != null ? D(tempCreditLimit) : D(creditLimit);
  const avail = effective.minus(exposure);
  return avail.greaterThan(0) ? avail : D(0);
}

export interface CreditExposure {
  customerId: string;
  creditLimit: string;
  tempCreditLimit: string | null;
  exposure: string; // Σ outstanding on posted/part-paid invoices
  available: string;
  overLimit: boolean;
}

/** Compute a customer's current credit exposure and available credit. */
export async function creditExposure(dataAreaId: string, customerId: string): Promise<CreditExposure> {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, dataAreaId } });
  if (!customer) throw new AuthError("Customer not found", 404);

  const invoices = await prisma.customerInvoice.findMany({
    where: { dataAreaId, customerId, status: { in: ["POSTED", "PARTIALLY_PAID"] } },
    select: { total: true, paidAmount: true },
  });
  const exposure = invoices.reduce((s, i) => s.plus(D(i.total).minus(i.paidAmount)), D(0));
  const available = availableCredit(customer.creditLimit, customer.tempCreditLimit, exposure);
  const effective = customer.tempCreditLimit ?? customer.creditLimit;

  return {
    customerId,
    creditLimit: D(customer.creditLimit).toFixed(2),
    tempCreditLimit: customer.tempCreditLimit ? D(customer.tempCreditLimit).toFixed(2) : null,
    exposure: exposure.toFixed(2),
    available: available.toFixed(2),
    overLimit: exposure.greaterThan(effective) && !customer.creditHoldOverride,
  };
}

// ── Collection workflow actions (spec: Collections §4) ──────────────────────

async function logActivity(
  dataAreaId: string,
  customerId: string,
  type: CollectionActivityType,
  data: Partial<{ invoiceId: string | null; note: string | null; dunningLevel: DunningLevel; promiseDate: Date; promiseAmount: Prisma.Decimal.Value; amount: Prisma.Decimal.Value; createdById: string | null }>,
) {
  return prisma.collectionActivity.create({
    data: {
      dataAreaId, customerId, type,
      invoiceId: data.invoiceId ?? null,
      note: data.note ?? null,
      dunningLevel: data.dunningLevel ?? null,
      promiseDate: data.promiseDate ?? null,
      promiseAmount: data.promiseAmount != null ? D(data.promiseAmount) : null,
      amount: data.amount != null ? D(data.amount) : null,
      createdById: data.createdById ?? null,
    },
  });
}

/** Advance the dunning level on an invoice (and the customer), logging the action. */
export async function setDunningLevel(dataAreaId: string, invoiceId: string, level: DunningLevel, note: string | null, userId?: string | null) {
  const inv = await prisma.customerInvoice.findFirst({ where: { id: invoiceId, dataAreaId } });
  if (!inv) throw new AuthError("Invoice not found", 404);
  await prisma.customerInvoice.update({ where: { id: inv.id }, data: { dunningLevel: level, lastContactDate: new Date(), updatedById: userId ?? null } });
  await prisma.customer.update({ where: { id: inv.customerId }, data: { dunningLevel: level } });
  return logActivity(dataAreaId, inv.customerId, "DUNNING", { invoiceId, dunningLevel: level, note, createdById: userId });
}

/** Record a dispute on an invoice. */
export async function raiseDispute(dataAreaId: string, invoiceId: string, status: DisputeStatus, disputedAmount: Prisma.Decimal.Value, note: string | null, userId?: string | null) {
  const inv = await prisma.customerInvoice.findFirst({ where: { id: invoiceId, dataAreaId } });
  if (!inv) throw new AuthError("Invoice not found", 404);
  if (D(disputedAmount).greaterThan(inv.total)) throw new AuthError("Disputed amount exceeds the invoice total", 422);
  await prisma.customerInvoice.update({ where: { id: inv.id }, data: { disputeStatus: status, disputedAmount: D(disputedAmount), updatedById: userId ?? null } });
  return logActivity(dataAreaId, inv.customerId, "DISPUTE", { invoiceId, amount: disputedAmount, note, createdById: userId });
}

/** Record a promise-to-pay on an invoice. */
export async function recordPromiseToPay(dataAreaId: string, invoiceId: string, promiseDate: Date, promiseAmount: Prisma.Decimal.Value, note: string | null, userId?: string | null) {
  const inv = await prisma.customerInvoice.findFirst({ where: { id: invoiceId, dataAreaId } });
  if (!inv) throw new AuthError("Invoice not found", 404);
  await prisma.customerInvoice.update({ where: { id: inv.id }, data: { promiseToPayDate: promiseDate, promiseToPayAmount: D(promiseAmount), lastContactDate: new Date(), updatedById: userId ?? null } });
  return logActivity(dataAreaId, inv.customerId, "PROMISE_TO_PAY", { invoiceId, promiseDate, promiseAmount, note, createdById: userId });
}

/** Log a free-form contact (call/email/letter/note), updating last-contact. */
export async function logContact(dataAreaId: string, customerId: string, type: CollectionActivityType, note: string | null, invoiceId: string | null, userId?: string | null) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, dataAreaId }, select: { id: true } });
  if (!customer) throw new AuthError("Customer not found", 404);
  if (invoiceId) await prisma.customerInvoice.update({ where: { id: invoiceId }, data: { lastContactDate: new Date() } });
  return logActivity(dataAreaId, customerId, type, { invoiceId, note, createdById: userId });
}

/**
 * Write off an invoice's outstanding balance as bad debt. Posts
 * Dr Bad Debt Expense (6200) / Cr Accounts Receivable (1100), marks the invoice's
 * dispute WRITTEN_OFF, records the write-off amount, and settles the invoice as PAID.
 */
export async function writeOffInvoice(dataAreaId: string, invoiceId: string, note: string | null, userId?: string | null) {
  const inv = await prisma.customerInvoice.findFirst({ where: { id: invoiceId, dataAreaId } });
  if (!inv) throw new AuthError("Invoice not found", 404);
  if (!["POSTED", "PARTIALLY_PAID"].includes(inv.status)) throw new AuthError(`Cannot write off a ${inv.status} invoice`, 409);

  const outstanding = D(inv.total).minus(inv.paidAmount);
  if (outstanding.lessThanOrEqualTo(0)) throw new AuthError("Nothing outstanding to write off", 422);

  const acc = async (code: string) => {
    const a = await prisma.account.findUnique({ where: { dataAreaId_code: { dataAreaId, code } }, select: { id: true } });
    if (!a) throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
    return a.id;
  };
  const [badDebtId, arId] = await Promise.all([acc(BAD_DEBT), acc(AR)]);

  const entry = await createJournalEntry(
    {
      dataAreaId, postingDate: new Date(), currency: inv.currency,
      memo: `Write-off ${inv.invoiceNumber}`,
      docType: "ADJUSTMENT",
      lines: [
        { accountId: badDebtId, debit: outstanding.toString(), memo: "Bad debt", partyTag: inv.customerId },
        { accountId: arId, credit: outstanding.toString(), memo: "AR relief", openItemRef: inv.invoiceNumber },
      ],
      createdById: userId,
    },
    { post: true },
  );

  await prisma.customerInvoice.update({
    where: { id: inv.id },
    data: {
      paidAmount: inv.total, status: "PAID",
      writeOffAmount: outstanding, disputeStatus: "WRITTEN_OFF",
      updatedById: userId ?? null,
    },
  });
  await logActivity(dataAreaId, inv.customerId, "WRITE_OFF", { invoiceId, amount: outstanding, note, createdById: userId });
  return { voucherNumber: entry.voucherNumber, writtenOff: outstanding.toFixed(2) };
}

/** Recent collection activity for a customer (newest first). */
export async function customerActivity(dataAreaId: string, customerId: string, limit = 50) {
  return prisma.collectionActivity.findMany({
    where: { dataAreaId, customerId },
    orderBy: { activityDate: "desc" },
    take: limit,
  });
}
