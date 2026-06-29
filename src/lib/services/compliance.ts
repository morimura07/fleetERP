import { prisma } from "@/lib/prisma";

/**
 * Compliance & document-lifecycle tracking (PRD §2.2, §4.2 M11, §8.3).
 *
 * Unifies every expiry-bearing document across vehicles (insurance, inspection,
 * COMESA permit, Yellow Card) and drivers (licence, passport, Yellow Fever, …)
 * into a single feed, each classified into a lifecycle bucket. The warning
 * window defaults to 14 days per the PRD non-functional requirement (§7).
 *
 * `docStatus` is a pure classifier so it is trivially unit-testable.
 */

export type DocBucket = "CURRENT" | "EXPIRING_SOON" | "EXPIRED";

/** Classify a single expiry date relative to `asOf` and the warning window. */
export function docStatus(
  expiresAt: Date | null | undefined,
  asOf: Date = new Date(),
  warningDays = 14,
): DocBucket | "MISSING" {
  if (!expiresAt) return "MISSING";
  const soon = new Date(asOf.getTime() + warningDays * 86_400_000);
  if (expiresAt < asOf) return "EXPIRED";
  if (expiresAt < soon) return "EXPIRING_SOON";
  return "CURRENT";
}

export interface ComplianceItem {
  ownerType: "VEHICLE" | "DRIVER";
  ownerId: string;
  ownerLabel: string; // plate / name
  docType: string; // INSURANCE / INSPECTION / COMESA_PERMIT / LICENSE …
  number: string | null;
  expiresAt: string | null; // ISO date
  status: DocBucket | "MISSING";
}

export interface ComplianceReport {
  asOf: string;
  warningDays: number;
  items: ComplianceItem[];
  summary: { current: number; expiringSoon: number; expired: number; missing: number };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Build the full compliance feed. `onlyAttention` returns just expiring/expired/
 * missing items (the actionable subset for the dashboard).
 */
export async function complianceReport(
  opts: { warningDays?: number; asOf?: Date; onlyAttention?: boolean } = {},
): Promise<ComplianceReport> {
  const asOf = opts.asOf ?? new Date();
  const warningDays = opts.warningDays ?? 14;
  const st = (d: Date | null | undefined) => docStatus(d, asOf, warningDays);

  const [vehicles, drivers] = await Promise.all([
    prisma.vehicle.findMany({
      select: {
        id: true, plateNumber: true,
        insuranceExpiry: true, inspectionExpiry: true,
        comesaPermitExpiry: true, yellowCardExpiry: true,
      },
    }),
    prisma.driver.findMany({
      where: { status: { not: "INACTIVE" } },
      select: { id: true, name: true, documents: { select: { type: true, number: true, expiresAt: true } } },
    }),
  ]);

  const items: ComplianceItem[] = [];

  for (const v of vehicles) {
    const docs: [string, Date | null][] = [
      ["INSURANCE", v.insuranceExpiry],
      ["INSPECTION", v.inspectionExpiry],
      ["COMESA_PERMIT", v.comesaPermitExpiry],
      ["YELLOW_CARD", v.yellowCardExpiry],
    ];
    for (const [docType, expiresAt] of docs) {
      items.push({
        ownerType: "VEHICLE", ownerId: v.id, ownerLabel: v.plateNumber,
        docType, number: null, expiresAt: iso(expiresAt), status: st(expiresAt),
      });
    }
  }

  for (const d of drivers) {
    for (const doc of d.documents) {
      items.push({
        ownerType: "DRIVER", ownerId: d.id, ownerLabel: d.name,
        docType: doc.type, number: doc.number, expiresAt: iso(doc.expiresAt), status: st(doc.expiresAt),
      });
    }
  }

  const summary = { current: 0, expiringSoon: 0, expired: 0, missing: 0 };
  for (const it of items) {
    if (it.status === "CURRENT") summary.current++;
    else if (it.status === "EXPIRING_SOON") summary.expiringSoon++;
    else if (it.status === "EXPIRED") summary.expired++;
    else summary.missing++;
  }

  const filtered = opts.onlyAttention
    ? items.filter((i) => i.status !== "CURRENT")
    : items;

  // Worst first: EXPIRED → MISSING → EXPIRING_SOON → CURRENT, then by date.
  const order: Record<string, number> = { EXPIRED: 0, MISSING: 1, EXPIRING_SOON: 2, CURRENT: 3 };
  filtered.sort((a, b) =>
    order[a.status] - order[b.status] || (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"),
  );

  return { asOf: iso(asOf)!, warningDays, items: filtered, summary };
}
