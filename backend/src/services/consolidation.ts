import { Prisma } from "@prisma/client";
import type { ConsolidationRun, ConsolidationRunLine, RateType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { updateWithVersion } from "@backend/lib/concurrency";
import { resolveRate } from "@backend/services/fx";
import { periodRange } from "@backend/services/planning";
import { createJournalEntry } from "@backend/services/ledger";
import {
  consolidate, eliminationJournal,
  type AccountBalance, type MapRule, type EntityRule, type CurrencyRates, type ConsolidationOutput, type RunLine,
} from "@backend/services/consolidation-engine";
import type { ConsolidationRunInput } from "@backend/lib/validations";

/**
 * Consolidations (client requirements, Sept 2026): the database-bound half.
 *
 * A run is created for a period and a set of subsidiaries, translated by the
 * engine from posted ledger balances, saved line by line, and may then be
 * posted: the elimination entries go into the parent ledger and the run is
 * locked. The rules live in consolidation-engine.ts; this file loads what
 * they need and stores what they produce.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const DAY_MS = 86_400_000;

export interface PeriodBounds {
  /** First day, inclusive. */
  start: Date;
  /** Day after the last day. */
  endExclusive: Date;
  /** Last day, inclusive; the date the closing rate is read at. */
  periodEnd: Date;
}

/**
 * The window a period label names. Month, quarter and year come from the
 * planning parser; an as-of date runs from the first day of that year, so a
 * mid-year consolidation carries the year's income and expenses to date.
 */
export function periodBounds(period: string): PeriodBounds {
  const asOf = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
  if (asOf) {
    const end = new Date(Date.UTC(Number(asOf[1]), Number(asOf[2]) - 1, Number(asOf[3])));
    if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== period) throw new AuthError(`Not a date: ${period}`, 422);
    return { start: new Date(Date.UTC(Number(asOf[1]), 0, 1)), endExclusive: new Date(end.getTime() + DAY_MS), periodEnd: end };
  }
  const range = periodRange(period);
  if (!range || /W/.test(period)) throw new AuthError("Period must be YYYY-MM, YYYY-Qn, YYYY or a date", 422);
  return { start: range.start, endExclusive: range.end, periodEnd: new Date(range.end.getTime() - DAY_MS) };
}

// ── Loading ──────────────────────────────────────────────────────────────────

/** Local currency of each entity, from the company register. */
async function currenciesOf(codes: string[], fallback: string): Promise<Map<string, string>> {
  const companies = await prisma.company.findMany({ where: { code: { in: codes } }, select: { code: true, baseCurrency: true } });
  const map = new Map(companies.map((c) => [c.code, c.baseCurrency]));
  for (const c of codes) if (!map.has(c)) map.set(c, fallback);
  return map;
}

/**
 * Every account of an entity that has posted activity, with its balance
 * brought forward to the period and its debits and credits within it.
 */
async function balancesOf(dataAreaId: string, currency: string, bounds: PeriodBounds, onlyAccount?: string): Promise<AccountBalance[]> {
  const accounts = await prisma.account.findMany({
    where: { dataAreaId, ...(onlyAccount ? { code: onlyAccount } : {}), lines: { some: { entry: { status: "POSTED", postingDate: { lt: bounds.endExclusive } } } } },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });
  if (accounts.length === 0) return [];
  const ids = accounts.map((a) => a.id);
  const [before, within] = await Promise.all([
    prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
      where: { accountId: { in: ids }, entry: { status: "POSTED", postingDate: { lt: bounds.start } } },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
      where: { accountId: { in: ids }, entry: { status: "POSTED", postingDate: { gte: bounds.start, lt: bounds.endExclusive } } },
    }),
  ]);
  const b = new Map(before.map((r) => [r.accountId, D(r._sum.debit ?? 0).minus(r._sum.credit ?? 0)]));
  const w = new Map(within.map((r) => [r.accountId, { debit: D(r._sum.debit ?? 0), credit: D(r._sum.credit ?? 0) }]));
  return accounts.map((a) => ({
    subsidiary: dataAreaId,
    subAccount: a.code,
    subAccountName: a.name,
    accountType: a.type,
    currency,
    beginningLocal: b.get(a.id) ?? 0,
    debitLocal: w.get(a.id)?.debit ?? 0,
    creditLocal: w.get(a.id)?.credit ?? 0,
  }));
}

/** The five rates the engine wants for one currency, from the parent's rate table. */
async function ratesFor(currency: string, parentArea: string, baseCurrency: string, bounds: PeriodBounds): Promise<CurrencyRates> {
  const at = (rateType: RateType, asOf: Date) => resolveRate(currency, { dataAreaId: parentArea, baseCurrency, rateType, asOf });
  const dayBefore = new Date(bounds.start.getTime() - DAY_MS);
  const [closingBegin, closingEnd, averagePrior, averagePeriod, historical] = await Promise.all([
    at("SPOT", dayBefore), at("SPOT", bounds.periodEnd), at("AVERAGE", dayBefore), at("AVERAGE", bounds.periodEnd), at("HISTORICAL", bounds.periodEnd),
  ]);
  return { closingBegin, closingEnd, averagePrior, averagePeriod, historical };
}

async function mapRulesFor(parentArea: string, subsidiaries: string[]): Promise<MapRule[]> {
  const [maps, parentAccounts] = await Promise.all([
    prisma.consolidationMap.findMany({ where: { parentArea, subsidiary: { in: subsidiaries } } }),
    prisma.account.findMany({ where: { dataAreaId: parentArea }, select: { code: true, name: true } }),
  ]);
  const names = new Map(parentAccounts.map((a) => [a.code, a.name]));
  return maps.map((m) => ({
    subsidiary: m.subsidiary, subAccount: m.subAccount, parentAccount: m.parentAccount,
    parentAccountName: names.get(m.parentAccount) ?? m.parentAccount,
    rateType: m.rateType, intercompany: m.intercompany,
  }));
}

/** Everything the engine needs for a parent, a period and a set of entities. */
async function gather(parentArea: string, baseCurrency: string, subsidiaries: string[], bounds: PeriodBounds, onlyAccount?: { subsidiary: string; code: string }) {
  const entities = [...new Set([parentArea, ...subsidiaries])];
  const currencies = await currenciesOf(entities, baseCurrency);
  const balances = (await Promise.all(
    entities
      .filter((e) => !onlyAccount || e === onlyAccount.subsidiary)
      .map((e) => balancesOf(e, currencies.get(e)!, bounds, onlyAccount?.code)),
  )).flat();
  const foreign = [...new Set([...currencies.values()].filter((c) => c !== baseCurrency))];
  const rates: Record<string, CurrencyRates> = {};
  for (const c of foreign) rates[c] = await ratesFor(c, parentArea, baseCurrency, bounds);
  const [maps, entityRows, parentAccounts] = await Promise.all([
    mapRulesFor(parentArea, entities),
    prisma.consolidationEntity.findMany({ where: { parentArea, subsidiary: { in: subsidiaries }, isActive: true } }),
    prisma.account.findMany({ where: { dataAreaId: parentArea }, select: { code: true, name: true } }),
  ]);
  const entityRules: EntityRule[] = entityRows.map((e) => ({ subsidiary: e.subsidiary, sharePct: e.sharePct, ctaAccount: e.ctaAccount }));
  return {
    input: { parentArea, baseCurrency, balances, maps, entities: entityRules, rates, parentAccountNames: Object.fromEntries(parentAccounts.map((a) => [a.code, a.name])) },
    rates,
    currencies,
  };
}

// ── Runs ─────────────────────────────────────────────────────────────────────

/** The subsidiaries a run covers: the ones asked for, else every active one. */
async function resolveSubsidiaries(parentArea: string, requested: string[]): Promise<string[]> {
  const configured = await prisma.consolidationEntity.findMany({ where: { parentArea, isActive: true }, select: { subsidiary: true } });
  const known = new Set(configured.map((e) => e.subsidiary));
  if (requested.length === 0) {
    if (known.size === 0) throw new AuthError("No subsidiaries are configured for this parent. Add one under Subsidiaries first.", 422);
    return [...known].sort();
  }
  const unknown = requested.filter((s) => !known.has(s) && s !== parentArea);
  if (unknown.length) {
    const exists = await prisma.company.findMany({ where: { code: { in: unknown } }, select: { code: true } });
    const missing = unknown.filter((s) => !exists.some((c) => c.code === s));
    if (missing.length) throw new AuthError(`Unknown entity: ${missing.join(", ")}`, 404);
  }
  return [...new Set(requested.filter((s) => s !== parentArea))].sort();
}

export async function createRun(input: ConsolidationRunInput, userId: string) {
  const bounds = periodBounds(input.period);
  const subsidiaries = await resolveSubsidiaries(input.parentArea, input.subsidiaries);
  const run = await prisma.consolidationRun.create({
    data: {
      parentArea: input.parentArea, baseCurrency: input.baseCurrency, period: input.period,
      periodStart: bounds.start, periodEnd: bounds.periodEnd, subsidiaries, memo: input.memo || null, createdById: userId,
    },
  });
  return computeRun(run.id, userId);
}

function toRow(runId: string, l: RunLine): Prisma.ConsolidationRunLineCreateManyInput {
  return {
    runId, subsidiary: l.subsidiary, subAccount: l.subAccount, subAccountName: l.subAccountName,
    parentAccount: l.parentAccount, parentAccountName: l.parentAccountName, accountType: l.accountType,
    currency: l.currency, rateType: l.rateType, rate: l.rate,
    beginningLocal: l.beginningLocal, debitLocal: l.debitLocal, creditLocal: l.creditLocal, endingLocal: l.endingLocal,
    beginningBase: l.beginningBase, activityBase: l.activityBase, endingBase: l.endingBase,
    eliminationBase: l.eliminationBase, sharePct: l.sharePct, consolidatedBase: l.consolidatedBase,
    intercompany: l.intercompany, isCta: l.isCta, sortOrder: l.sortOrder,
  };
}

/** Translate (again) from the ledgers as they stand now. Not for a posted run. */
export async function computeRun(runId: string, userId: string) {
  const run = await prisma.consolidationRun.findUnique({ where: { id: runId } });
  if (!run) throw new AuthError("Consolidation run not found", 404);
  if (run.status === "POSTED") throw new AuthError("A posted run is locked; create a new run for this period", 409);
  const bounds = periodBounds(run.period);
  const { input, rates } = await gather(run.parentArea, run.baseCurrency, run.subsidiaries, bounds);
  const out = consolidate(input);
  const warnings = {
    unmapped: out.warnings.unmapped,
    missingRates: out.warnings.missingRates,
    icMismatchBase: out.warnings.icMismatchBase.toFixed(2),
    notes: out.warnings.notes,
    rates: Object.fromEntries(Object.entries(rates).map(([c, r]) => [c, Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? null : D(v).toString()]))])),
  };
  await prisma.$transaction(async (tx) => {
    await tx.consolidationRunLine.deleteMany({ where: { runId } });
    await tx.consolidationRunLine.createMany({ data: out.lines.map((l) => toRow(runId, l)) });
    await tx.consolidationRun.update({
      where: { id: runId },
      data: { status: "SIMULATED", ranAt: new Date(), warnings, updatedById: userId, version: { increment: 1 } },
    });
  });
  return getRun(runId);
}

export interface RunDetail extends ConsolidationRun {
  lines: ConsolidationRunLine[];
  summary: {
    endingBase: string;
    eliminationBase: string;
    consolidatedBase: string;
    ctaBase: string;
    ctaActivityBase: string;
    byParentAccount: { parentAccount: string; parentAccountName: string; accountType: string; consolidatedBase: string }[];
    byEntity: { subsidiary: string; currency: string; lines: number; endingBase: string; ctaBase: string; sharePct: string }[];
  };
}

/** A run with its lines and the totals derived from them. */
export async function getRun(runId: string): Promise<RunDetail> {
  const run = await prisma.consolidationRun.findUnique({ where: { id: runId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!run) throw new AuthError("Consolidation run not found", 404);
  const sum = (pick: (l: ConsolidationRunLine) => Prisma.Decimal.Value, rows = run.lines) => rows.reduce((s, l) => s.plus(pick(l)), D(0)).toFixed(2);
  const byParent = new Map<string, RunDetail["summary"]["byParentAccount"][number] & { total: Prisma.Decimal }>();
  for (const l of run.lines) {
    const row = byParent.get(l.parentAccount) ?? { parentAccount: l.parentAccount, parentAccountName: l.parentAccountName, accountType: l.accountType, consolidatedBase: "0", total: D(0) };
    row.total = row.total.plus(l.consolidatedBase);
    row.consolidatedBase = row.total.toFixed(2);
    byParent.set(l.parentAccount, row);
  }
  const entities = [...new Set(run.lines.map((l) => l.subsidiary))].sort();
  return {
    ...run,
    summary: {
      endingBase: sum((l) => l.endingBase),
      eliminationBase: sum((l) => l.eliminationBase),
      consolidatedBase: sum((l) => l.consolidatedBase),
      ctaBase: sum((l) => l.consolidatedBase, run.lines.filter((l) => l.isCta)),
      ctaActivityBase: sum((l) => l.activityBase, run.lines.filter((l) => l.isCta)),
      byParentAccount: [...byParent.values()].map(({ total: _t, ...r }) => r).sort((a, b) => a.parentAccount.localeCompare(b.parentAccount)),
      byEntity: entities.map((e) => {
        const rows = run.lines.filter((l) => l.subsidiary === e);
        return {
          subsidiary: e, currency: rows[0]?.currency ?? run.baseCurrency, lines: rows.filter((l) => !l.isCta).length,
          endingBase: sum((l) => l.endingBase, rows.filter((l) => !l.isCta)),
          ctaBase: sum((l) => l.endingBase, rows.filter((l) => l.isCta)),
          sharePct: rows[0]?.sharePct.toFixed(2) ?? "100.00",
        };
      }),
    },
  };
}

/**
 * Post the elimination entries to the parent ledger and lock the run.
 * Refused while the group's intercompany balances do not net to zero: an
 * unbalanced elimination would have to be forced with a suspense line, and
 * that is a decision for the accountant, not the system.
 */
export async function postRun(runId: string, userId: string) {
  const run = await getRun(runId);
  if (run.status !== "SIMULATED") throw new AuthError(`Only a simulated run can be posted (this one is ${run.status})`, 409);
  const warnings = (run.warnings ?? {}) as { icMismatchBase?: string; missingRates?: string[] };
  if (warnings.icMismatchBase && !D(warnings.icMismatchBase).isZero()) {
    throw new AuthError(`Intercompany balances do not net to zero (${warnings.icMismatchBase} ${run.baseCurrency}). Book the missing side, then run the translation again.`, 422);
  }
  if (warnings.missingRates?.length) {
    throw new AuthError(`Rates are missing for ${warnings.missingRates.join(", ")}. Add them, then run the translation again.`, 422);
  }

  const journal = eliminationJournal(run.lines);
  let postingEntryId: string | null = null;
  if (journal.length > 0) {
    const codes = [...new Set(journal.map((j) => j.parentAccount))];
    const accounts = await prisma.account.findMany({ where: { dataAreaId: run.parentArea, code: { in: codes }, isActive: true }, select: { id: true, code: true } });
    const missing = codes.filter((c) => !accounts.some((a) => a.code === c));
    if (missing.length) throw new AuthError(`The parent chart has no active account ${missing.join(", ")}; the mapping points at an account that does not exist`, 422);
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));
    const entry = await createJournalEntry(
      {
        dataAreaId: run.parentArea,
        postingDate: run.periodEnd,
        currency: run.baseCurrency,
        docType: "ADJUSTMENT",
        referenceNo: `CONS-${run.period}`,
        memo: `Consolidation eliminations ${run.period} (${run.subsidiaries.join(", ")})`,
        createdById: userId,
        lines: journal.map((j) => ({ accountId: byCode.get(j.parentAccount)!, debit: j.debit, credit: j.credit, memo: j.memo })),
      },
      { post: true },
    );
    postingEntryId = entry.id;
  }
  await prisma.consolidationRun.update({
    where: { id: runId },
    data: { status: "POSTED", postedAt: new Date(), postingEntryId, updatedById: userId, version: { increment: 1 } },
  });
  return getRun(runId);
}

export async function deleteRun(runId: string) {
  const run = await prisma.consolidationRun.findUnique({ where: { id: runId }, select: { status: true } });
  if (!run) throw new AuthError("Consolidation run not found", 404);
  if (run.status === "POSTED") throw new AuthError("A posted run cannot be deleted; reverse its journal entry instead", 409);
  await prisma.consolidationRun.delete({ where: { id: runId } });
  return { ok: true };
}

// ── Mapping ──────────────────────────────────────────────────────────────────

/**
 * What one mapping row would produce for a period: the translated line and
 * the rates it used. The "Test mapping" action.
 */
export async function testMapping(mapId: string, period: string, baseCurrency = "USD") {
  const map = await prisma.consolidationMap.findUnique({ where: { id: mapId } });
  if (!map) throw new AuthError("Mapping not found", 404);
  const bounds = periodBounds(period);
  const { input, rates, currencies } = await gather(map.parentArea, baseCurrency, [map.subsidiary], bounds, { subsidiary: map.subsidiary, code: map.subAccount });
  const out: ConsolidationOutput = consolidate({ ...input, entities: input.entities });
  const line = out.lines.find((l) => !l.isCta) ?? null;
  const currency = currencies.get(map.subsidiary) ?? baseCurrency;
  return {
    period, periodStart: bounds.start, periodEnd: bounds.periodEnd, currency,
    rates: rates[currency] ?? null,
    line,
    hasActivity: line != null,
  };
}

export async function updateMap(id: string, version: number, userId: string, data: Record<string, unknown>) {
  return updateWithVersion(prisma.consolidationMap, id, version, userId, data);
}
