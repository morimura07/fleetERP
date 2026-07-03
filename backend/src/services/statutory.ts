import { Prisma } from "@prisma/client";

/**
 * Statutory payroll deductions (M9) — config-driven per country.
 *
 * PAYE is computed on progressive bands; NSSF (pension) and SHIF (health) are
 * percentage contributions, each optionally capped. Rates live in `SCHEMES`,
 * keyed by ISO country, so adding a country is a data change, not a code change.
 * Figures are representative monthly rates and should be reviewed against the
 * current finance-act schedules before go-live.
 *
 * The math (`computeStatutory`) is pure so it is unit-tested independently.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** A PAYE band: income above `from` (up to the next band's `from`) taxed at `rate`. */
export interface PayeBand {
  from: number; // lower bound of the band (monthly, base ccy units)
  rate: number; // marginal rate, e.g. 0.30 for 30%
}

export interface StatutoryScheme {
  payeBands: PayeBand[]; // ascending by `from`; first band usually rate 0
  nssfRate: number; // employee pension %
  nssfCap?: number; // max monthly pensionable pay (optional)
  shifRate: number; // employee health %
  shifMin?: number; // minimum monthly contribution (optional)
}

/**
 * Representative schemes. Tanzania & Kenya seeded; extend as needed.
 * (Monthly, employee-side deductions only.)
 */
export const SCHEMES: Record<string, StatutoryScheme> = {
  TZ: {
    payeBands: [
      { from: 0, rate: 0 },
      { from: 270_000, rate: 0.08 },
      { from: 520_000, rate: 0.2 },
      { from: 760_000, rate: 0.25 },
      { from: 1_000_000, rate: 0.3 },
    ],
    nssfRate: 0.1, // 10% employee
    shifRate: 0.03, // NHIF-equivalent
  },
  KE: {
    payeBands: [
      { from: 0, rate: 0.1 },
      { from: 24_000, rate: 0.25 },
      { from: 32_333, rate: 0.3 },
      { from: 500_000, rate: 0.325 },
      { from: 800_000, rate: 0.35 },
    ],
    nssfRate: 0.06,
    nssfCap: 36_000, // pensionable pay cap
    shifRate: 0.0275, // SHIF 2.75%
    shifMin: 300,
  },
};

export interface StatutoryResult {
  gross: Prisma.Decimal;
  paye: Prisma.Decimal;
  nssf: Prisma.Decimal;
  shif: Prisma.Decimal;
  net: Prisma.Decimal;
}

/** Progressive PAYE on a monthly gross using the scheme's bands. */
export function computePaye(gross: Prisma.Decimal.Value, bands: PayeBand[]): Prisma.Decimal {
  const g = D(gross);
  let tax = new Prisma.Decimal(0);
  const sorted = [...bands].sort((a, b) => a.from - b.from);
  for (let i = 0; i < sorted.length; i++) {
    const lower = sorted[i].from;
    if (g.lessThanOrEqualTo(lower)) break;
    const upper = i + 1 < sorted.length ? sorted[i + 1].from : Number.POSITIVE_INFINITY;
    const taxableInBand = Prisma.Decimal.min(g, new Prisma.Decimal(Number.isFinite(upper) ? upper : g)).minus(lower);
    if (taxableInBand.greaterThan(0)) tax = tax.plus(taxableInBand.times(sorted[i].rate));
  }
  return tax;
}

/**
 * Full statutory breakdown for one employee's monthly gross under a country's
 * scheme. Unknown country falls back to TZ. NSSF/SHIF apply their cap/min.
 */
export function computeStatutory(gross: Prisma.Decimal.Value, country: string): StatutoryResult {
  const scheme = SCHEMES[country] ?? SCHEMES.TZ;
  const g = D(gross);

  const paye = computePaye(g, scheme.payeBands);

  const pensionable = scheme.nssfCap ? Prisma.Decimal.min(g, new Prisma.Decimal(scheme.nssfCap)) : g;
  const nssf = pensionable.times(scheme.nssfRate);

  let shif = g.times(scheme.shifRate);
  if (scheme.shifMin && shif.lessThan(scheme.shifMin)) shif = new Prisma.Decimal(scheme.shifMin);

  const net = g.minus(paye).minus(nssf).minus(shif);
  return {
    gross: g,
    paye: paye,
    nssf: nssf,
    shif: shif,
    net: net,
  };
}
