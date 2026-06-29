import { Prisma, RateType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";

/**
 * Multi-currency support (PRD §7, M8/M5).
 *
 * Exchange rates are stored per (entity, currency, baseCurrency, rateType) with a
 * `validFrom` date. A lookup takes the most recent rate on/before the as-of date.
 * Three rate types per the PRD: SPOT (transaction), AVERAGE (period revaluation),
 * HISTORICAL (acquisition). Pure conversion arithmetic is kept side-effect free.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** Convert a foreign amount to base currency at the given rate. base = foreign × rate. */
export function convert(amount: Prisma.Decimal.Value, rate: Prisma.Decimal.Value): Prisma.Decimal {
  return D(amount).times(rate);
}

/**
 * Resolve the applicable rate for a currency → base at a point in time. Returns
 * `1` when currency === base. Returns null when no rate is configured.
 */
export async function resolveRate(
  currency: string,
  opts: {
    dataAreaId?: string;
    baseCurrency?: string;
    rateType?: RateType;
    asOf?: Date;
  } = {},
): Promise<Prisma.Decimal | null> {
  const base = opts.baseCurrency ?? "USD";
  if (currency === base) return new Prisma.Decimal(1);

  const row = await prisma.exchangeRate.findFirst({
    where: {
      dataAreaId: opts.dataAreaId ?? "HQ01",
      currency,
      baseCurrency: base,
      rateType: opts.rateType ?? "SPOT",
      validFrom: { lte: opts.asOf ?? new Date() },
    },
    orderBy: { validFrom: "desc" },
    select: { rate: true },
  });
  return row ? new Prisma.Decimal(row.rate) : null;
}

/**
 * Convert an amount to base currency using the configured rate. When no rate
 * exists the original amount is returned with `rate: null` so callers can flag
 * the gap rather than silently mis-stating the figure.
 */
export async function toBase(
  amount: Prisma.Decimal.Value,
  currency: string,
  opts: { dataAreaId?: string; baseCurrency?: string; rateType?: RateType; asOf?: Date } = {},
): Promise<{ base: Prisma.Decimal; rate: Prisma.Decimal | null }> {
  const rate = await resolveRate(currency, opts);
  if (!rate) return { base: D(amount), rate: null };
  return { base: convert(amount, rate), rate };
}
