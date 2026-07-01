import { Prisma, RateType, InvoiceStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { resolveRate } from "@backend/services/fx";
import { createJournalEntry } from "@backend/services/ledger";

/**
 * Multi-currency period-end revaluation (M8, PRD §7).
 *
 * Open foreign-currency AP/AR balances are restated to the period-end rate. The
 * unrealized FX gain/loss is the difference between the outstanding balance
 * valued at the rate on the invoice date (booking rate) and at the period-end
 * rate. One net adjusting journal entry is posted per run, per entity.
 *
 *   AR (asset):     rate ↑ ⇒ gain   | rate ↓ ⇒ loss
 *   AP (liability): rate ↑ ⇒ loss   | rate ↓ ⇒ gain
 *
 * Base currency and same-currency balances are skipped (no exposure). Balances
 * whose currency has no configured period-end rate are reported as `skipped`
 * rather than silently mis-stated.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * Pure unrealized-gain calculation for one open balance (base currency).
 * gain > 0 = gain to the entity, < 0 = loss.
 *   AR (asset):     base value rises with the rate ⇒ gain when periodRate > bookingRate
 *   AP (liability): base value rises with the rate ⇒ loss when periodRate > bookingRate
 */
export function unrealizedGain(
  kind: "AP" | "AR",
  outstandingForeign: Prisma.Decimal.Value,
  bookingRate: Prisma.Decimal.Value,
  periodRate: Prisma.Decimal.Value,
): Prisma.Decimal {
  const rateDelta = D(outstandingForeign).times(periodRate).minus(D(outstandingForeign).times(bookingRate));
  return kind === "AR" ? rateDelta : rateDelta.negated();
}

const ACCOUNTS_PAYABLE = "2000";
const ACCOUNTS_RECEIVABLE = "1100";
const FX_GAIN = "4900"; // INCOME
const FX_LOSS = "6900"; // EXPENSE

export interface RevalLine {
  kind: "AP" | "AR";
  invoiceNumber: string;
  currency: string;
  outstanding: string; // foreign
  bookingRate: string;
  periodRate: string;
  baseAtBooking: string;
  baseAtPeriod: string;
  delta: string; // base; +gain / −loss from the entity's perspective
}

export interface RevalResult {
  dataAreaId: string;
  baseCurrency: string;
  asOf: string;
  rateType: RateType;
  lines: RevalLine[];
  skipped: { invoiceNumber: string; currency: string; reason: string }[];
  totalGain: string; // net gain (may be negative = net loss)
  posted: { voucherNumber: string } | null;
}

/** period end = last day of the given year/month (local date). */
export function periodEnd(year: number, month: number): Date {
  return new Date(year, month, 0); // day 0 of next month = last day of this month
}

async function accountIdOrThrow(dataAreaId: string, code: string): Promise<string> {
  const a = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  if (!a) throw new AuthError(`Account ${code} not found for ${dataAreaId}`, 422);
  return a.id;
}

export interface RevalOptions {
  dataAreaId: string;
  year: number;
  month: number;
  baseCurrency?: string;
  rateType?: RateType;
  /** false = preview only (compute, don't post). */
  post?: boolean;
  createdById?: string | null;
}

export async function revaluePeriod(opts: RevalOptions): Promise<RevalResult> {
  const base = opts.baseCurrency ?? "USD";
  const rateType = opts.rateType ?? "AVERAGE";
  const asOf = periodEnd(opts.year, opts.month);

  const openStatuses: InvoiceStatus[] = [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID];
  const [vendorInvoices, customerInvoices] = await Promise.all([
    prisma.vendorInvoice.findMany({
      where: { dataAreaId: opts.dataAreaId, status: { in: openStatuses }, currency: { not: base } },
      select: { invoiceNumber: true, currency: true, total: true, paidAmount: true, invoiceDate: true },
    }),
    prisma.customerInvoice.findMany({
      where: { dataAreaId: opts.dataAreaId, status: { in: openStatuses }, currency: { not: base } },
      select: { invoiceNumber: true, currency: true, total: true, paidAmount: true, invoiceDate: true },
    }),
  ]);

  const lines: RevalLine[] = [];
  const skipped: RevalResult["skipped"] = [];
  let netGain = new Prisma.Decimal(0); // + = gain, − = loss

  async function evaluate(
    inv: { invoiceNumber: string; currency: string; total: Prisma.Decimal; paidAmount: Prisma.Decimal; invoiceDate: Date },
    kind: "AP" | "AR",
  ) {
    const outstanding = D(inv.total).minus(inv.paidAmount);
    if (!outstanding.greaterThan(0)) return;

    const bookingRate = await resolveRate(inv.currency, {
      dataAreaId: opts.dataAreaId, baseCurrency: base, rateType, asOf: inv.invoiceDate,
    });
    const periodRate = await resolveRate(inv.currency, {
      dataAreaId: opts.dataAreaId, baseCurrency: base, rateType, asOf,
    });
    if (!bookingRate || !periodRate) {
      skipped.push({ invoiceNumber: inv.invoiceNumber, currency: inv.currency, reason: "no rate configured" });
      return;
    }

    const baseAtBooking = outstanding.times(bookingRate);
    const baseAtPeriod = outstanding.times(periodRate);
    const gain = unrealizedGain(kind, outstanding, bookingRate, periodRate);
    if (gain.isZero()) return;

    netGain = netGain.plus(gain);
    lines.push({
      kind,
      invoiceNumber: inv.invoiceNumber,
      currency: inv.currency,
      outstanding: outstanding.toFixed(2),
      bookingRate: bookingRate.toString(),
      periodRate: periodRate.toString(),
      baseAtBooking: baseAtBooking.toFixed(2),
      baseAtPeriod: baseAtPeriod.toFixed(2),
      delta: gain.toFixed(2),
    });
  }

  for (const inv of vendorInvoices) await evaluate(inv, "AP");
  for (const inv of customerInvoices) await evaluate(inv, "AR");

  let posted: RevalResult["posted"] = null;

  if (opts.post && !netGain.isZero()) {
    // Net the AR and AP control adjustments; book the balancing FX gain/loss.
    // A net gain: Cr FX Gain, Dr the control accounts (net); loss is the mirror.
    // We post one line per control account touched plus the P&L line.
    const arDelta = lines.filter((l) => l.kind === "AR").reduce((s, l) => s.plus(l.delta), new Prisma.Decimal(0));
    const apGain = lines.filter((l) => l.kind === "AP").reduce((s, l) => s.plus(l.delta), new Prisma.Decimal(0));

    const [arId, apId, gainId, lossId] = await Promise.all([
      accountIdOrThrow(opts.dataAreaId, ACCOUNTS_RECEIVABLE),
      accountIdOrThrow(opts.dataAreaId, ACCOUNTS_PAYABLE),
      accountIdOrThrow(opts.dataAreaId, FX_GAIN),
      accountIdOrThrow(opts.dataAreaId, FX_LOSS),
    ]);

    const entryLines: { accountId: string; debit?: string; credit?: string; memo?: string }[] = [];

    // AR control: gain ⇒ Dr AR (asset up); loss ⇒ Cr AR.
    if (!arDelta.isZero()) {
      entryLines.push(
        arDelta.greaterThan(0)
          ? { accountId: arId, debit: arDelta.toFixed(2), memo: "AR FX revaluation" }
          : { accountId: arId, credit: arDelta.abs().toFixed(2), memo: "AR FX revaluation" },
      );
    }
    // AP control: gain ⇒ Dr AP (liability down); loss ⇒ Cr AP (liability up).
    if (!apGain.isZero()) {
      entryLines.push(
        apGain.greaterThan(0)
          ? { accountId: apId, debit: apGain.toFixed(2), memo: "AP FX revaluation" }
          : { accountId: apId, credit: apGain.abs().toFixed(2), memo: "AP FX revaluation" },
      );
    }
    // Balancing P&L line: net gain ⇒ Cr FX Gain; net loss ⇒ Dr FX Loss.
    entryLines.push(
      netGain.greaterThan(0)
        ? { accountId: gainId, credit: netGain.toFixed(2), memo: "Unrealized FX gain" }
        : { accountId: lossId, debit: netGain.abs().toFixed(2), memo: "Unrealized FX loss" },
    );

    const entry = await createJournalEntry(
      {
        dataAreaId: opts.dataAreaId,
        postingDate: asOf,
        currency: base,
        memo: `FX revaluation ${opts.year}-${String(opts.month).padStart(2, "0")}`,
        lines: entryLines,
        createdById: opts.createdById ?? null,
      },
      { post: true },
    );
    posted = { voucherNumber: entry.voucherNumber };
  }

  return {
    dataAreaId: opts.dataAreaId,
    baseCurrency: base,
    asOf: asOf.toISOString().slice(0, 10),
    rateType,
    lines,
    skipped,
    totalGain: netGain.toFixed(2),
    posted,
  };
}
