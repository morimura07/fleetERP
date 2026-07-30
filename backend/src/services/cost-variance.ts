import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";

/**
 * Standard-cost variance (M13). The inventory engine values stock at moving
 * average (`avgCost`); this report compares that actual cost against the item's
 * `standardCost` benchmark and surfaces two views:
 *
 *   • On-hand variance — for each item, (average − standard) per unit and the
 *     resulting value difference on the quantity currently held. Positive =
 *     actual above standard = unfavorable.
 *   • Realized purchase price variance (PPV) — over actual receipts,
 *     Σ (receipt unit cost − standard) × quantity: how much purchasing has
 *     deviated from standard over time.
 *
 * Pure arithmetic here; no change to the valuation engine or postings.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface ItemVariance {
  unitVariance: Prisma.Decimal; // avgCost − standardCost (per unit; + = unfavorable)
  variancePct: Prisma.Decimal; // unitVariance / standardCost * 100 (0 when no standard)
  onHandStandard: Prisma.Decimal; // qty × standardCost
  onHandActual: Prisma.Decimal; // qty × avgCost
  varianceValue: Prisma.Decimal; // onHandActual − onHandStandard (+ = unfavorable)
}

/** Per-item on-hand variance of actual (moving-average) cost vs standard. Pure. */
export function itemVariance(item: {
  standardCost: Prisma.Decimal.Value;
  avgCost: Prisma.Decimal.Value;
  quantityOnHand: Prisma.Decimal.Value;
}): ItemVariance {
  const std = D(item.standardCost);
  const act = D(item.avgCost);
  const qty = D(item.quantityOnHand);
  const unitVariance = act.minus(std);
  const onHandStandard = qty.times(std);
  const onHandActual = qty.times(act);
  return {
    unitVariance,
    variancePct: std.greaterThan(0) ? unitVariance.dividedBy(std).times(100) : new Prisma.Decimal(0),
    onHandStandard,
    onHandActual,
    varianceValue: onHandActual.minus(onHandStandard),
  };
}

/**
 * Realized purchase price variance across receipts: Σ (unitCost − standardCost)
 * × quantity. Only receipts of items with a standard cost count. Pure.
 */
export function purchasePriceVariance(
  receipts: { unitCost: Prisma.Decimal.Value; quantity: Prisma.Decimal.Value; standardCost: Prisma.Decimal.Value | null }[],
): Prisma.Decimal {
  let ppv = new Prisma.Decimal(0);
  for (const r of receipts) {
    if (r.standardCost == null) continue;
    const std = D(r.standardCost);
    if (!std.greaterThan(0)) continue;
    ppv = ppv.plus(D(r.unitCost).minus(std).times(r.quantity));
  }
  return ppv;
}

export interface VarianceRow {
  code: string;
  name: string;
  currency: string;
  standardCost: string;
  avgCost: string;
  quantityOnHand: string;
  unitVariance: string;
  variancePct: string;
  varianceValue: string;
}

export interface CostVarianceReport {
  currency: string;
  rows: VarianceRow[];
  totals: { itemCount: number; onHandStandard: string; onHandActual: string; varianceValue: string };
  realizedPpv: string;
  receiptCount: number;
}

/**
 * Build the standard-cost variance report for an entity. Only items with a
 * standard cost set are included; rows are ranked by absolute variance value.
 */
export async function getCostVarianceReport(dataAreaId: string): Promise<CostVarianceReport> {
  const items = await prisma.stockItem.findMany({
    where: { dataAreaId, standardCost: { not: null, gt: 0 } },
    select: { code: true, name: true, currency: true, standardCost: true, avgCost: true, quantityOnHand: true },
    orderBy: { name: "asc" },
  });

  const rows: (VarianceRow & { _abs: Prisma.Decimal })[] = [];
  let totalStd = new Prisma.Decimal(0), totalAct = new Prisma.Decimal(0);
  for (const it of items) {
    const v = itemVariance({ standardCost: it.standardCost!, avgCost: it.avgCost, quantityOnHand: it.quantityOnHand });
    totalStd = totalStd.plus(v.onHandStandard);
    totalAct = totalAct.plus(v.onHandActual);
    rows.push({
      code: it.code, name: it.name, currency: it.currency,
      standardCost: D(it.standardCost!).toFixed(4),
      avgCost: D(it.avgCost).toFixed(4),
      quantityOnHand: D(it.quantityOnHand).toFixed(3),
      unitVariance: v.unitVariance.toFixed(4),
      variancePct: v.variancePct.toFixed(1),
      varianceValue: v.varianceValue.toFixed(2),
      _abs: v.varianceValue.abs(),
    });
  }
  rows.sort((a, b) => b._abs.comparedTo(a._abs));

  // Realized PPV from receipts of these standard-costed items.
  const receipts = await prisma.stockMovement.findMany({
    where: { dataAreaId, type: "RECEIPT", stockItem: { standardCost: { not: null, gt: 0 } } },
    select: { unitCost: true, quantity: true, stockItem: { select: { standardCost: true } } },
  });
  const ppv = purchasePriceVariance(receipts.map((r) => ({ unitCost: r.unitCost, quantity: r.quantity, standardCost: r.stockItem.standardCost })));

  return {
    currency: "USD",
    rows: rows.map(({ _abs, ...r }) => r),
    totals: {
      itemCount: items.length,
      onHandStandard: totalStd.toFixed(2),
      onHandActual: totalAct.toFixed(2),
      varianceValue: totalAct.minus(totalStd).toFixed(2),
    },
    realizedPpv: ppv.toFixed(2),
    receiptCount: receipts.length,
  };
}
