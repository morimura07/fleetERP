import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { docStatus } from "@backend/services/compliance";

/**
 * Asset custody / assignment + warranty tracking (M19). Custody: who holds a
 * fixed asset over time — the open assignment (returnedAt = null) is the current
 * custodian; assigning a new one closes the previous. Warranty: the asset's
 * warranty expiry classified with the same CURRENT / EXPIRING_SOON / EXPIRED
 * buckets as the compliance dashboard.
 */

export interface AssignInput {
  dataAreaId: string;
  assetId: string;
  employeeId?: string | null;
  custodian: string;
  location?: string | null;
  assignedAt: Date;
  note?: string | null;
  createdById?: string | null;
}

/**
 * Assign an asset to a custodian. Any currently-open assignment is closed
 * (returned as of the new assignment date) so an asset has one holder at a time.
 * Atomic.
 */
export async function assignAsset(input: AssignInput) {
  const asset = await prisma.fixedAsset.findFirst({ where: { id: input.assetId, dataAreaId: input.dataAreaId }, select: { id: true } });
  if (!asset) throw new AuthError("Asset not found in this company", 404);
  if (input.employeeId) {
    const emp = await prisma.employee.findFirst({ where: { id: input.employeeId, dataAreaId: input.dataAreaId }, select: { id: true } });
    if (!emp) throw new AuthError("Employee not found in this company", 404);
  }
  if (!input.custodian.trim()) throw new AuthError("A custodian is required", 422);

  return prisma.$transaction(async (tx) => {
    await tx.assetAssignment.updateMany({
      where: { assetId: input.assetId, returnedAt: null },
      data: { returnedAt: input.assignedAt },
    });
    return tx.assetAssignment.create({
      data: {
        dataAreaId: input.dataAreaId,
        assetId: input.assetId,
        employeeId: input.employeeId ?? null,
        custodian: input.custodian.trim(),
        location: input.location?.trim() || null,
        assignedAt: input.assignedAt,
        note: input.note ?? null,
        createdById: input.createdById ?? null,
      },
    });
  });
}

/** Return an asset — close its open assignment as of `returnedAt`. */
export async function returnAsset(dataAreaId: string, assetId: string, returnedAt: Date) {
  const open = await prisma.assetAssignment.findFirst({ where: { assetId, dataAreaId, returnedAt: null }, select: { id: true } });
  if (!open) throw new AuthError("This asset is not currently assigned", 422);
  return prisma.assetAssignment.update({ where: { id: open.id }, data: { returnedAt } });
}

export interface CustodyView {
  current: { custodian: string; location: string | null; employeeName: string | null; assignedAt: string } | null;
  history: { custodian: string; location: string | null; employeeName: string | null; assignedAt: string; returnedAt: string | null; note: string | null }[];
}

/** The current custodian plus the full assignment history for an asset. */
export async function getAssetCustody(dataAreaId: string, assetId: string): Promise<CustodyView> {
  const asset = await prisma.fixedAsset.findFirst({ where: { id: assetId, dataAreaId }, select: { id: true } });
  if (!asset) throw new AuthError("Asset not found in this company", 404);

  const rows = await prisma.assetAssignment.findMany({
    where: { assetId, dataAreaId },
    include: { employee: { select: { name: true } } },
    orderBy: { assignedAt: "desc" },
  });
  const open = rows.find((r) => r.returnedAt === null) ?? null;
  return {
    current: open ? { custodian: open.custodian, location: open.location, employeeName: open.employee?.name ?? null, assignedAt: open.assignedAt.toISOString().slice(0, 10) } : null,
    history: rows.map((r) => ({
      custodian: r.custodian,
      location: r.location,
      employeeName: r.employee?.name ?? null,
      assignedAt: r.assignedAt.toISOString().slice(0, 10),
      returnedAt: r.returnedAt?.toISOString().slice(0, 10) ?? null,
      note: r.note,
    })),
  };
}

/** Warranty-expiry status for an asset (reuses the compliance classifier). */
export function warrantyStatus(warrantyExpiresAt: Date | null | undefined, asOf: Date = new Date(), warningDays = 30) {
  return docStatus(warrantyExpiresAt, asOf, warningDays);
}
