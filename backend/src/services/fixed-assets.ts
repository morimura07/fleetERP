import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { createJournalEntry } from "@backend/services/ledger";

/**
 * Fixed Assets (M20) — asset register with straight-line depreciation and disposal.
 *
 * Depreciation (per period, straight-line):
 *   monthly = (acquisitionCost − residualValue) / usefulLifeMonths
 *   The final period charges only the remainder so book value lands exactly on the
 *   residual value and never goes below it. Each charge posts one journal entry:
 *     Dr Depreciation Expense (5200)
 *       Cr Accumulated Depreciation (1510)
 *
 * Disposal (removes the asset from the books):
 *   Dr Accumulated Depreciation (1510)   accumulated to date
 *   Dr Cash on Hand (1000)               proceeds received
 *     Cr Fixed Assets (1500)             acquisition cost
 *   plus the balancing gain/loss on the net book value:
 *     gain = proceeds − bookValue  →  Cr Gain on Disposal (4910)
 *     loss = bookValue − proceeds  →  Dr Loss on Disposal (6910)
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const CASH = "1000"; // Cash on Hand — disposal proceeds land here
const GAIN = "4910"; // Gain on Disposal of Assets
const LOSS = "6910"; // Loss on Disposal of Assets

async function accountId(dataAreaId: string, code: string): Promise<string> {
  const a = await prisma.account.findUnique({
    where: { dataAreaId_code: { dataAreaId, code } },
    select: { id: true },
  });
  if (!a) throw new AuthError(`Account ${code} not found (seed the chart of accounts)`, 404);
  return a.id;
}

/** "YYYY-MM" for a date. */
export function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last calendar day of a "YYYY-MM" period (UTC), used to test in-service eligibility. */
function endOfPeriod(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59)); // day 0 of next month = last day of this month
}

interface AssetForDep {
  acquisitionCost: Prisma.Decimal;
  residualValue: Prisma.Decimal;
  usefulLifeMonths: number;
  accumulatedDepreciation: Prisma.Decimal;
}

/**
 * Depreciation to charge for one more period, given what has accumulated so far.
 * Returns a non-negative amount, capped so book value never drops below residual.
 * Pure — the unit tests exercise this directly.
 */
export function monthlyDepreciation(a: AssetForDep): Prisma.Decimal {
  const cost = D(a.acquisitionCost);
  const residual = D(a.residualValue);
  const depreciableBase = cost.minus(residual);
  if (depreciableBase.lessThanOrEqualTo(0) || a.usefulLifeMonths <= 0) return D(0);

  // Amount still available to depreciate before hitting the residual floor.
  const remaining = depreciableBase.minus(a.accumulatedDepreciation);
  if (remaining.lessThanOrEqualTo(0)) return D(0);

  const straightLine = depreciableBase.dividedBy(a.usefulLifeMonths).toDecimalPlaces(2);
  // Final period: charge only what's left so we land exactly on residual.
  return Prisma.Decimal.min(straightLine, remaining);
}

/** Net book value = cost − accumulated depreciation. */
export function bookValue(cost: Prisma.Decimal.Value, accumulated: Prisma.Decimal.Value): Prisma.Decimal {
  return D(cost).minus(accumulated);
}

export interface DepreciationRunResult {
  period: string;
  charged: { assetId: string; code: string; amount: string; bookValueAfter: string }[];
  skipped: { assetId: string; code: string; reason: string }[];
  totalCharged: string;
}

/**
 * Run depreciation for a period across every eligible asset in a company. Idempotent
 * per (asset, period): assets already depreciated for `period` are skipped, so re-running
 * is safe. Each charge is posted to the ledger and recorded as a DepreciationEntry.
 */
export async function runDepreciation(
  dataAreaId: string,
  period: string,
  createdById?: string | null,
): Promise<DepreciationRunResult> {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new AuthError("period must be YYYY-MM", 422);
  const periodEnd = endOfPeriod(period);

  const assets = await prisma.fixedAsset.findMany({
    where: { dataAreaId, status: "ACTIVE" },
    orderBy: { code: "asc" },
  });

  const charged: DepreciationRunResult["charged"] = [];
  const skipped: DepreciationRunResult["skipped"] = [];
  let total = D(0);

  for (const asset of assets) {
    if (asset.inServiceDate > periodEnd) {
      skipped.push({ assetId: asset.id, code: asset.code, reason: "not yet in service" });
      continue;
    }
    const existing = await prisma.depreciationEntry.findUnique({
      where: { fixedAssetId_period: { fixedAssetId: asset.id, period } },
      select: { id: true },
    });
    if (existing) {
      skipped.push({ assetId: asset.id, code: asset.code, reason: "already depreciated for period" });
      continue;
    }

    const amount = monthlyDepreciation(asset);
    if (amount.lessThanOrEqualTo(0)) {
      // Fully depreciated already — flip status so future runs ignore it.
      await prisma.fixedAsset.update({
        where: { id: asset.id },
        data: { status: "FULLY_DEPRECIATED" },
      });
      skipped.push({ assetId: asset.id, code: asset.code, reason: "fully depreciated" });
      continue;
    }

    const newAccum = D(asset.accumulatedDepreciation).plus(amount);
    const bvAfter = bookValue(asset.acquisitionCost, newAccum);
    const fullyDone = newAccum.greaterThanOrEqualTo(D(asset.acquisitionCost).minus(asset.residualValue));

    const [expId, accumId] = await Promise.all([
      accountId(dataAreaId, asset.expenseCode),
      accountId(dataAreaId, asset.accumDepCode),
    ]);

    const entry = await createJournalEntry(
      {
        dataAreaId,
        postingDate: periodEnd,
        currency: "USD",
        memo: `Depreciation ${period} — ${asset.code}`,
        lines: [
          { accountId: expId, debit: amount.toString(), memo: `Depreciation ${asset.name}` },
          { accountId: accumId, credit: amount.toString(), memo: `Accum. dep. ${asset.code}` },
        ],
        createdById,
      },
      { post: true },
    );

    await prisma.$transaction([
      prisma.depreciationEntry.create({
        data: {
          dataAreaId,
          fixedAssetId: asset.id,
          period,
          amount,
          bookValueAfter: bvAfter,
          journalEntryId: entry.id,
        },
      }),
      prisma.fixedAsset.update({
        where: { id: asset.id },
        data: {
          accumulatedDepreciation: newAccum,
          lastDepreciatedPeriod: period,
          status: fullyDone ? "FULLY_DEPRECIATED" : "ACTIVE",
          updatedById: createdById ?? undefined,
        },
      }),
    ]);

    charged.push({ assetId: asset.id, code: asset.code, amount: amount.toString(), bookValueAfter: bvAfter.toString() });
    total = total.plus(amount);
  }

  return { period, charged, skipped, totalCharged: total.toString() };
}

export interface DisposalInput {
  proceeds: Prisma.Decimal.Value;
  disposalDate: Date;
}

/**
 * Dispose of an asset: writes off its net book value, books the proceeds, and posts
 * the resulting gain or loss. The asset moves to DISPOSED and can't be re-disposed.
 */
export async function disposeAsset(
  dataAreaId: string,
  assetId: string,
  input: DisposalInput,
  createdById?: string | null,
) {
  const asset = await prisma.fixedAsset.findFirst({ where: { id: assetId, dataAreaId } });
  if (!asset) throw new AuthError("Asset not found", 404);
  if (asset.status === "DISPOSED") throw new AuthError("Asset is already disposed", 409);

  const proceeds = D(input.proceeds);
  if (proceeds.lessThan(0)) throw new AuthError("Proceeds cannot be negative", 422);

  const accum = D(asset.accumulatedDepreciation);
  const nbv = bookValue(asset.acquisitionCost, accum);
  const gain = proceeds.minus(nbv); // positive = gain, negative = loss

  const [assetAcc, accumAcc, cashAcc] = await Promise.all([
    accountId(dataAreaId, asset.assetAccountCode),
    accountId(dataAreaId, asset.accumDepCode),
    accountId(dataAreaId, CASH),
  ]);

  const lines: { accountId: string; debit?: string; credit?: string; memo?: string }[] = [
    { accountId: assetAcc, credit: D(asset.acquisitionCost).toString(), memo: `Dispose ${asset.code}` },
  ];
  if (accum.greaterThan(0)) {
    lines.push({ accountId: accumAcc, debit: accum.toString(), memo: "Remove accum. depreciation" });
  }
  if (proceeds.greaterThan(0)) {
    lines.push({ accountId: cashAcc, debit: proceeds.toString(), memo: "Disposal proceeds" });
  }
  if (gain.greaterThan(0)) {
    const gainAcc = await accountId(dataAreaId, GAIN);
    lines.push({ accountId: gainAcc, credit: gain.toString(), memo: "Gain on disposal" });
  } else if (gain.lessThan(0)) {
    const lossAcc = await accountId(dataAreaId, LOSS);
    lines.push({ accountId: lossAcc, debit: gain.abs().toString(), memo: "Loss on disposal" });
  }

  const entry = await createJournalEntry(
    {
      dataAreaId,
      postingDate: input.disposalDate,
      currency: "USD",
      memo: `Disposal — ${asset.code}`,
      lines,
      createdById,
    },
    { post: true },
  );

  return prisma.fixedAsset.update({
    where: { id: asset.id },
    data: {
      status: "DISPOSED",
      disposalDate: input.disposalDate,
      disposalProceeds: proceeds,
      disposalEntryId: entry.id,
      updatedById: createdById ?? undefined,
    },
  });
}
