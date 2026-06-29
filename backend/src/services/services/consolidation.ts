import { Prisma, RateType } from "@prisma/client";
import { prisma } from "@backend/prisma";
import { resolveRate, convert } from "@backend/services/fx";

/**
 * Consolidations (M5).
 *
 * A consolidation run rolls each subsidiary's posted balances up into the parent
 * (HQ) ledger using the ConsolidationMap (subAccount → parentAccount) and a
 * selectable exchange-rate type (Spot / Average / Historical, PRD M5).
 *
 * Subsidiary account balances are read from POSTED journal lines. Net movement
 * per account = Σ(debit − credit), then translated to the parent's base currency.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface ConsolidatedLine {
  parentAccount: string;
  subsidiary: string;
  subAccount: string;
  currency: string;
  localBalance: string; // net movement in subsidiary currency
  rate: string | null; // applied rate (null = no rate configured)
  baseBalance: string; // translated to parent base currency
}

export interface ConsolidationResult {
  parentArea: string;
  baseCurrency: string;
  rateType: RateType;
  asOf: string;
  lines: ConsolidatedLine[];
  unmappedAccounts: string[]; // subsidiary accounts with balances but no mapping
  missingRates: string[]; // currencies with no configured rate
  totalBase: string;
}

/**
 * Run a consolidation for a parent entity. Reads each mapped subsidiary account's
 * net POSTED movement, translates it at the chosen rate type, and groups by
 * parent account. Read-only — produces a report, does not post to the ledger.
 */
export async function runConsolidation(opts: {
  parentArea?: string;
  baseCurrency?: string;
  rateType?: RateType;
  asOf?: Date;
}): Promise<ConsolidationResult> {
  const parentArea = opts.parentArea ?? "HQ01";
  const baseCurrency = opts.baseCurrency ?? "USD";
  const rateType = opts.rateType ?? "AVERAGE";
  const asOf = opts.asOf ?? new Date();

  const maps = await prisma.consolidationMap.findMany({ where: { parentArea } });

  // Net movement per (subsidiary entity, account code) from POSTED entries.
  const lines: ConsolidatedLine[] = [];
  const missingRates = new Set<string>();
  const mappedKeys = new Set<string>();
  let totalBase = new Prisma.Decimal(0);
  const rateCache = new Map<string, Prisma.Decimal | null>();

  for (const m of maps) {
    mappedKeys.add(`${m.subsidiary}:${m.subAccount}`);

    const agg = await prisma.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        account: { dataAreaId: m.subsidiary, code: m.subAccount },
        entry: { status: "POSTED", postingDate: { lte: asOf } },
      },
    });
    const local = D(agg._sum.debit ?? 0).minus(agg._sum.credit ?? 0);

    // Currency of the subsidiary's postings (assume one base per entity).
    const sample = await prisma.journalEntry.findFirst({
      where: { dataAreaId: m.subsidiary, status: "POSTED" },
      orderBy: { postingDate: "desc" },
      select: { currency: true },
    });
    const currency = sample?.currency ?? baseCurrency;

    let rate = rateCache.get(currency);
    if (rate === undefined) {
      rate = await resolveRate(currency, { dataAreaId: parentArea, baseCurrency, rateType, asOf });
      rateCache.set(currency, rate);
    }
    if (rate === null && currency !== baseCurrency) missingRates.add(currency);

    const effectiveRate = rate ?? new Prisma.Decimal(1);
    const baseBalance = convert(local, effectiveRate);
    totalBase = totalBase.plus(baseBalance);

    lines.push({
      parentAccount: m.parentAccount,
      subsidiary: m.subsidiary,
      subAccount: m.subAccount,
      currency,
      localBalance: local.toFixed(2),
      rate: rate ? rate.toString() : null,
      baseBalance: baseBalance.toFixed(2),
    });
  }

  // Subsidiary accounts that carry a balance but have no mapping row.
  const subsidiaries = [...new Set(maps.map((m) => m.subsidiary))];
  const unmapped: string[] = [];
  for (const sub of subsidiaries) {
    const accounts = await prisma.account.findMany({
      where: { dataAreaId: sub, lines: { some: { entry: { status: "POSTED" } } } },
      select: { code: true },
    });
    for (const a of accounts) {
      if (!mappedKeys.has(`${sub}:${a.code}`)) unmapped.push(`${sub}:${a.code}`);
    }
  }

  return {
    parentArea,
    baseCurrency,
    rateType,
    asOf: asOf.toISOString().slice(0, 10),
    lines,
    unmappedAccounts: unmapped,
    missingRates: [...missingRates],
    totalBase: totalBase.toFixed(2),
  };
}
