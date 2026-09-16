import { randomBytes } from "node:crypto";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import type { AuthUser } from "@backend/lib/auth";
import { getPo, acknowledgePo, markInProduction, markDispatched } from "@backend/services/purchase-order";

/**
 * Supplier collaboration without vendor logins (client requirements, Sept
 * 2026, Procurement §3, SOP steps 14-15). An issued order gets a secret
 * link; whoever holds it sees the order, downloads the PDF, accepts it with
 * a delivery date or rejects it, and reports production and dispatch. The
 * link expires and can be reissued; every action is recorded as the
 * supplier's. A full portal with vendor accounts is a separate scope item.
 */

const DEFAULT_DAYS = 30;

/** The system user an action through the link is attributed to. */
const supplierActor = (po: { vendor: { legalName: string; code: string } }): AuthUser => ({
  id: `supplier:${po.vendor.code}`, email: "", name: `${po.vendor.legalName} (supplier link)`, role: "STAFF", roleKey: null, driverId: null, dataAreaId: "", organizationId: null,
});

export async function issueSupplierLink(poId: string, user: AuthUser, days = DEFAULT_DAYS) {
  const po = await getPo(poId);
  if (!["APPROVED", "ISSUED", "ACKNOWLEDGED", "IN_PRODUCTION"].includes(po.status)) throw new AuthError(`A supplier link needs an approved or issued order (this one is ${po.status.toLowerCase().replace("_", " ")})`, 409);
  const token = randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + days * 86_400_000);
  await prisma.purchaseOrder.update({ where: { id: poId }, data: { supplierToken: token, supplierTokenExpiresAt: expires, updatedById: user.id } });
  return { token, expiresAt: expires, path: `/supplier/po/${token}` };
}

export async function revokeSupplierLink(poId: string, user: AuthUser) {
  await prisma.purchaseOrder.update({ where: { id: poId }, data: { supplierToken: null, supplierTokenExpiresAt: null, updatedById: user.id } });
  return { ok: true };
}

async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new AuthError("This link is not valid", 404);
  const row = await prisma.purchaseOrder.findUnique({ where: { supplierToken: token }, select: { id: true, supplierTokenExpiresAt: true } });
  if (!row) throw new AuthError("This link is not valid", 404);
  if (row.supplierTokenExpiresAt && row.supplierTokenExpiresAt < new Date()) throw new AuthError("This link has expired; ask the buyer for a new one", 410);
  return getPo(row.id);
}

/** What the supplier sees: the order, not the buyer's internals. */
export async function supplierView(token: string) {
  const po = await byToken(token);
  const company = await prisma.company.findUnique({ where: { code: po.dataAreaId }, select: { name: true } });
  return {
    poNumber: po.poNumber, status: po.status, currency: po.currency, subtotal: po.subtotal.toFixed(2), orderDate: po.orderDate, expectedAt: po.expectedAt,
    committedDeliveryDate: po.committedDeliveryDate, supplierNote: po.supplierNote, issuedAt: po.issuedAt, acknowledgedAt: po.acknowledgedAt, inProductionAt: po.inProductionAt, dispatchedAt: po.dispatchedAt,
    buyer: company?.name ?? po.dataAreaId, vendor: { code: po.vendor.code, legalName: po.vendor.legalName },
    lines: po.lines.map((l) => ({ description: l.description, quantity: l.quantity.toFixed(3), unitPrice: l.unitPrice.toFixed(2), lineTotal: l.lineTotal.toFixed(2) })),
    expiresAt: po.supplierTokenExpiresAt,
    canAcknowledge: po.status === "ISSUED", canReportProduction: po.status === "ACKNOWLEDGED", canReportDispatch: ["ACKNOWLEDGED", "IN_PRODUCTION"].includes(po.status),
  };
}

export async function supplierAct(token: string, action: "acknowledge" | "production" | "dispatch", body: { accept?: boolean; committedDeliveryDate?: Date | null; note?: string | null }) {
  const po = await byToken(token);
  const actor = supplierActor(po);
  if (action === "acknowledge") await acknowledgePo(po.id, actor, { accept: body.accept !== false, committedDeliveryDate: body.committedDeliveryDate ?? null, note: body.note ?? null });
  else if (action === "production") await markInProduction(po.id, actor, body.note);
  else await markDispatched(po.id, actor, body.note);
  return supplierView(token);
}

export { byToken as supplierPo };
