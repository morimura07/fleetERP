import { Prisma } from "@prisma/client";
import { prisma } from "@backend/prisma";
import { agingBucket, type AgingBucket } from "@backend/services/ap-ar";

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
