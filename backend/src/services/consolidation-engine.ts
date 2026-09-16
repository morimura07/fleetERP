import { Prisma } from "@prisma/client";
import type { AccountType, RateType } from "@prisma/client";

/**
 * Consolidation under IAS 21, the current-rate method, as pure functions.
 *
 * Each account of each entity is translated at the rate its type calls for:
 * assets and liabilities at the closing rate, income and expenses at the
 * period's average rate, equity at the historical rate. A trial balance that
 * balanced in local currency no longer balances once its lines are
 * translated at different rates; the residual is the cumulative translation
 * adjustment, presented in equity. Nothing here plugs it by hand: it is the
 * sum of the other lines, negated, per entity.
 *
 * Intercompany balances are eliminated in full. Ownership below 100% is
 * applied proportionately. Debit balances are positive, credits negative,
 * throughout.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const two = (v: Prisma.Decimal) => v.toDecimalPlaces(2);

/** The rate an account type is translated at when the mapping does not say. */
export function defaultRateType(type: AccountType): RateType {
  switch (type) {
    case "ASSET":
    case "LIABILITY":
      return "SPOT";
    case "EQUITY":
      return "HISTORICAL";
    default:
      return "AVERAGE";
  }
}

export interface AccountBalance {
  subsidiary: string;
  subAccount: string;
  subAccountName: string;
  accountType: AccountType;
  currency: string;
  beginningLocal: Prisma.Decimal.Value;
  debitLocal: Prisma.Decimal.Value;
  creditLocal: Prisma.Decimal.Value;
}

export interface MapRule {
  subsidiary: string;
  subAccount: string;
  parentAccount: string;
  parentAccountName: string;
  rateType?: RateType | null;
  intercompany: boolean;
}

export interface EntityRule {
  subsidiary: string;
  sharePct: Prisma.Decimal.Value;
  ctaAccount: string;
}

/**
 * The rates of one period for one currency. Closing rates at both ends so a
 * beginning balance can be restated at the rate that applied then; the
 * average for the period and the one before, for income and expenses; one
 * historical rate for equity. Null where none is configured.
 */
export interface CurrencyRates {
  closingBegin: Prisma.Decimal.Value | null;
  closingEnd: Prisma.Decimal.Value | null;
  averagePrior: Prisma.Decimal.Value | null;
  averagePeriod: Prisma.Decimal.Value | null;
  historical: Prisma.Decimal.Value | null;
}

export interface ConsolidationInput {
  parentArea: string;
  baseCurrency: string;
  balances: AccountBalance[];
  maps: MapRule[];
  entities: EntityRule[];
  rates: Record<string, CurrencyRates>;
  /** Parent chart, for naming the CTA and unmapped-account lines. */
  parentAccountNames?: Record<string, string>;
}

export interface RunLine {
  subsidiary: string;
  subAccount: string;
  subAccountName: string;
  parentAccount: string;
  parentAccountName: string;
  accountType: AccountType;
  currency: string;
  rateType: RateType;
  rate: Prisma.Decimal | null;
  beginningLocal: Prisma.Decimal;
  debitLocal: Prisma.Decimal;
  creditLocal: Prisma.Decimal;
  endingLocal: Prisma.Decimal;
  beginningBase: Prisma.Decimal;
  activityBase: Prisma.Decimal;
  endingBase: Prisma.Decimal;
  eliminationBase: Prisma.Decimal;
  sharePct: Prisma.Decimal;
  consolidatedBase: Prisma.Decimal;
  intercompany: boolean;
  isCta: boolean;
  sortOrder: number;
}

export interface Warnings {
  /** "KE01:5300" accounts with a balance and no mapping row (rolled up under their own code). */
  unmapped: string[];
  /** Currencies with no rate for a type that was needed, as "KES:SPOT". */
  missingRates: string[];
  /** Group-wide sum of eliminated balances; zero when both sides of every IC balance are booked. */
  icMismatchBase: Prisma.Decimal;
  notes: string[];
}

export interface ConsolidationOutput {
  lines: RunLine[];
  warnings: Warnings;
  totals: {
    endingBase: Prisma.Decimal;
    eliminationBase: Prisma.Decimal;
    consolidatedBase: Prisma.Decimal;
    /** Sum of the CTA lines: the group's translation adjustment. */
    ctaBase: Prisma.Decimal;
    /** Movement in CTA over the period: the translation gain (negative) or loss (positive). */
    ctaActivityBase: Prisma.Decimal;
  };
  /** Consolidated balance per parent account, after elimination and share. */
  byParentAccount: { parentAccount: string; parentAccountName: string; accountType: AccountType; consolidatedBase: Prisma.Decimal }[];
}

/** Pick the rate for a line's type at the beginning or end of the period. */
function pickRate(rates: CurrencyRates | undefined, rateType: RateType, at: "begin" | "end"): Prisma.Decimal | null {
  if (!rates) return null;
  const raw =
    rateType === "SPOT" ? (at === "begin" ? rates.closingBegin : rates.closingEnd)
    : rateType === "AVERAGE" ? (at === "begin" ? rates.averagePrior : rates.averagePeriod)
    : rates.historical;
  return raw == null ? null : D(raw);
}

/**
 * Translate one entity's accounts, eliminate its intercompany balances,
 * apply the ownership share, and derive its CTA. Pure.
 */
export function consolidate(input: ConsolidationInput): ConsolidationOutput {
  const mapIndex = new Map(input.maps.map((m) => [`${m.subsidiary}:${m.subAccount}`, m]));
  const entityIndex = new Map(input.entities.map((e) => [e.subsidiary, e]));
  const parentNames = input.parentAccountNames ?? {};

  const warnings: Warnings = { unmapped: [], missingRates: [], icMismatchBase: D(0), notes: [] };
  const missing = new Set<string>();
  const lines: RunLine[] = [];
  let order = 0;

  // Group by entity so each gets its own CTA.
  const bySub = new Map<string, AccountBalance[]>();
  for (const b of input.balances) {
    if (!bySub.has(b.subsidiary)) bySub.set(b.subsidiary, []);
    bySub.get(b.subsidiary)!.push(b);
  }

  let icTotal = D(0);
  let ctaTotal = D(0);
  let ctaActivity = D(0);

  for (const [subsidiary, balances] of [...bySub.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const isParent = subsidiary === input.parentArea;
    const entity = entityIndex.get(subsidiary);
    const share = isParent ? D(100) : D(entity?.sharePct ?? 100);
    if (!isParent && !entity) warnings.notes.push(`${subsidiary}: no ownership share configured; consolidated at 100%`);

    let sumBeginning = D(0);
    let sumEnding = D(0);

    for (const b of [...balances].sort((x, y) => x.subAccount.localeCompare(y.subAccount))) {
      const map = mapIndex.get(`${subsidiary}:${b.subAccount}`);
      if (!map && !isParent) warnings.unmapped.push(`${subsidiary}:${b.subAccount}`);
      const parentAccount = map?.parentAccount ?? b.subAccount;
      const parentAccountName = map?.parentAccountName ?? parentNames[parentAccount] ?? b.subAccountName;
      const rateType = map?.rateType ?? defaultRateType(b.accountType);

      const beginningLocal = D(b.beginningLocal);
      const debitLocal = D(b.debitLocal);
      const creditLocal = D(b.creditLocal);
      const activityLocal = debitLocal.minus(creditLocal);
      const endingLocal = beginningLocal.plus(activityLocal);

      // The parent's own books are already in base currency.
      const local = b.currency === input.baseCurrency;
      const rates = local ? undefined : input.rates[b.currency];
      let rateBegin = local ? D(1) : pickRate(rates, rateType, "begin");
      let rateEnd = local ? D(1) : pickRate(rates, rateType, "end");
      if (!local && rateEnd == null) missing.add(`${b.currency}:${rateType}`);
      // A missing beginning rate falls back to the ending one: the beginning
      // figure is then restated, which understates the period's FX effect but
      // keeps the ending balance right.
      if (rateBegin == null) rateBegin = rateEnd;
      const rEnd = rateEnd ?? D(1);
      const rBegin = rateBegin ?? D(1);

      let beginningBase: Prisma.Decimal;
      let activityBase: Prisma.Decimal;
      let endingBase: Prisma.Decimal;
      if (rateType === "AVERAGE") {
        // Income and expenses: what happened this period at this period's
        // average; what was brought forward at the average that applied then.
        beginningBase = two(beginningLocal.times(rBegin));
        activityBase = two(activityLocal.times(rEnd));
        endingBase = beginningBase.plus(activityBase);
      } else {
        // Balance sheet: each end restated at its own closing rate, so the
        // period's activity in base includes the FX effect on the opening
        // balance. Equity: one historical rate at both ends.
        beginningBase = two(beginningLocal.times(rBegin));
        endingBase = two(endingLocal.times(rEnd));
        activityBase = endingBase.minus(beginningBase);
      }

      const intercompany = map?.intercompany ?? false;
      const eliminationBase = intercompany ? endingBase.negated() : D(0);
      if (intercompany) icTotal = icTotal.plus(endingBase);
      const consolidatedBase = two(endingBase.plus(eliminationBase).times(share).dividedBy(100));

      sumBeginning = sumBeginning.plus(beginningBase);
      sumEnding = sumEnding.plus(endingBase);

      lines.push({
        subsidiary, subAccount: b.subAccount, subAccountName: b.subAccountName, parentAccount, parentAccountName,
        accountType: b.accountType, currency: b.currency, rateType, rate: local ? D(1) : rateEnd,
        beginningLocal: two(beginningLocal), debitLocal: two(debitLocal), creditLocal: two(creditLocal), endingLocal: two(endingLocal),
        beginningBase, activityBase, endingBase, eliminationBase, sharePct: share, consolidatedBase,
        intercompany, isCta: false, sortOrder: order++,
      });
    }

    // The translation adjustment: whatever makes the translated books balance
    // again. A credit (negative) when the local currency strengthened against
    // net assets, a debit when it weakened. None for the parent itself.
    if (!isParent && balances.length > 0) {
      const ctaAccount = entity?.ctaAccount ?? "3900";
      const currency = balances[0].currency;
      const ctaBegin = sumBeginning.negated();
      const ctaEnd = sumEnding.negated();
      const ctaAct = ctaEnd.minus(ctaBegin);
      ctaTotal = ctaTotal.plus(two(ctaEnd.times(share).dividedBy(100)));
      ctaActivity = ctaActivity.plus(two(ctaAct.times(share).dividedBy(100)));
      lines.push({
        subsidiary, subAccount: "CTA", subAccountName: "Cumulative translation adjustment", parentAccount: ctaAccount,
        parentAccountName: parentNames[ctaAccount] ?? "Cumulative translation adjustment",
        accountType: "EQUITY", currency, rateType: "SPOT", rate: null,
        beginningLocal: D(0), debitLocal: D(0), creditLocal: D(0), endingLocal: D(0),
        beginningBase: two(ctaBegin), activityBase: two(ctaAct), endingBase: two(ctaEnd), eliminationBase: D(0),
        sharePct: share, consolidatedBase: two(ctaEnd.times(share).dividedBy(100)),
        intercompany: false, isCta: true, sortOrder: order++,
      });
    }
  }

  warnings.missingRates = [...missing].sort();
  warnings.icMismatchBase = two(icTotal);
  if (!icTotal.isZero()) {
    warnings.notes.push(`Intercompany balances do not net to zero (${two(icTotal).toFixed(2)} ${input.baseCurrency}); one side of a balance is missing or booked at a different rate.`);
  }
  warnings.notes.push("Retained earnings brought forward are translated at the prior period's average rate, not layered historical rates.");

  const byParent = new Map<string, ConsolidationOutput["byParentAccount"][number]>();
  for (const l of lines) {
    const row = byParent.get(l.parentAccount) ?? { parentAccount: l.parentAccount, parentAccountName: l.parentAccountName, accountType: l.accountType, consolidatedBase: D(0) };
    row.consolidatedBase = row.consolidatedBase.plus(l.consolidatedBase);
    byParent.set(l.parentAccount, row);
  }

  const sum = (pick: (l: RunLine) => Prisma.Decimal) => two(lines.reduce((s, l) => s.plus(pick(l)), D(0)));
  return {
    lines,
    warnings,
    totals: {
      endingBase: sum((l) => l.endingBase),
      eliminationBase: sum((l) => l.eliminationBase),
      consolidatedBase: sum((l) => l.consolidatedBase),
      ctaBase: two(ctaTotal),
      ctaActivityBase: two(ctaActivity),
    },
    byParentAccount: [...byParent.values()].sort((a, b) => a.parentAccount.localeCompare(b.parentAccount)),
  };
}

/**
 * The elimination journal for the parent ledger: for each intercompany line,
 * the opposite of its translated balance on its parent account. Balanced only
 * when the group's IC balances net to zero, which the caller must check.
 */
export type EliminationSource = Pick<RunLine, "intercompany" | "eliminationBase" | "parentAccount" | "subsidiary" | "subAccount" | "subAccountName">;

export function eliminationJournal(lines: EliminationSource[]): { parentAccount: string; debit: Prisma.Decimal; credit: Prisma.Decimal; memo: string }[] {
  const out: { parentAccount: string; debit: Prisma.Decimal; credit: Prisma.Decimal; memo: string }[] = [];
  for (const l of lines) {
    if (!l.intercompany || l.eliminationBase.isZero()) continue;
    const amt = l.eliminationBase; // negative = credit
    out.push({
      parentAccount: l.parentAccount,
      debit: amt.greaterThan(0) ? amt : D(0),
      credit: amt.lessThan(0) ? amt.negated() : D(0),
      memo: `Eliminate ${l.subsidiary} ${l.subAccount} ${l.subAccountName}`,
    });
  }
  return out;
}
