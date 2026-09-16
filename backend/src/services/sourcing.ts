import { Prisma } from "@prisma/client";
import type { Rfq, RfqLine, RfqVendor, Quotation, QuotationLine, Vendor } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import type { AuthUser } from "@backend/lib/auth";
import { policyFor } from "@backend/services/doa";
import type { RfqInput, QuotationInput, NegotiationInput, QuoteScoreInput } from "@backend/lib/validations";

/**
 * Sourcing (client requirements, Sept 2026, Procurement §2; SOP steps 4 to
 * 12): the approved vendor list, requests for quotation, the quotes that
 * come back, and the comparison that leads to an award. The award itself
 * raises the purchase order and is in purchase-order.ts.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export type RfqDetail = Rfq & {
  lines: RfqLine[];
  vendors: (RfqVendor & { vendor: Pick<Vendor, "id" | "code" | "legalName" | "avlStatus" | "avlRegion" | "currency" | "email"> })[];
  quotations: (Quotation & { lines: QuotationLine[]; vendor: Pick<Vendor, "id" | "code" | "legalName"> })[];
};

async function nextNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.rfq.count({ where: { dataAreaId } });
  return `RFQ-${String(n + 1).padStart(6, "0")}`;
}

const rfqInclude = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  vendors: { include: { vendor: { select: { id: true, code: true, legalName: true, avlStatus: true, avlRegion: true, currency: true, email: true } } }, orderBy: { invitedAt: "asc" as const } },
  quotations: { include: { lines: true, vendor: { select: { id: true, code: true, legalName: true } } }, orderBy: { receivedAt: "asc" as const } },
};

export async function getRfq(id: string): Promise<RfqDetail> {
  const r = await prisma.rfq.findUnique({ where: { id }, include: rfqInclude });
  if (!r) throw new AuthError("RFQ not found", 404);
  return r;
}

/** Vendors may be invited only from the approved list. Names the ones that are not. */
async function assertApprovedVendors(dataAreaId: string, vendorIds: string[]) {
  if (vendorIds.length === 0) return;
  const vendors = await prisma.vendor.findMany({ where: { id: { in: vendorIds }, dataAreaId }, select: { id: true, code: true, avlStatus: true, isActive: true } });
  const missing = vendorIds.filter((id) => !vendors.some((v) => v.id === id));
  if (missing.length) throw new AuthError("A vendor is not in this company", 404);
  const notApproved = vendors.filter((v) => v.avlStatus !== "APPROVED" || !v.isActive);
  if (notApproved.length) throw new AuthError(`Not on the approved vendor list: ${notApproved.map((v) => v.code).join(", ")}. Approve them under Vendors first.`, 422);
}

/**
 * Raise an RFQ, from an approved requisition (its lines are copied and it
 * moves to SOURCING) or free-standing.
 */
export async function createRfq(dataAreaId: string, user: AuthUser, input: RfqInput): Promise<RfqDetail> {
  await assertApprovedVendors(dataAreaId, input.vendorIds);
  let lines = input.lines.map((l, i) => ({
    requisitionLineId: null as string | null, stockItemId: l.stockItemId || null, description: l.description, uom: l.uom || "PIECE",
    quantity: D(l.quantity), expenseCode: l.expenseCode || "5100", specification: l.specification || null, sortOrder: i,
  }));
  let currency = input.currency;
  if (input.requisitionId) {
    const pr = await prisma.requisition.findFirst({ where: { id: input.requisitionId, dataAreaId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    if (!pr) throw new AuthError("Requisition not found in this company", 404);
    if (!["APPROVED", "SOURCING"].includes(pr.status)) throw new AuthError(`Only an approved requisition can be sourced (this one is ${pr.status.toLowerCase().replace("_", " ")})`, 409);
    if (lines.length === 0) {
      lines = pr.lines.map((l, i) => ({
        requisitionLineId: l.id, stockItemId: l.stockItemId, description: l.description, uom: l.uom, quantity: l.quantity,
        expenseCode: l.expenseCode, specification: l.specification, sortOrder: i,
      }));
      currency = currency || pr.currency;
    }
  }
  if (lines.length === 0) throw new AuthError("An RFQ needs at least one line", 422);
  const rfq = await prisma.$transaction(async (tx) => {
    const created = await tx.rfq.create({
      data: {
        dataAreaId, rfqNumber: await nextNumber(dataAreaId), requisitionId: input.requisitionId || null, title: input.title,
        currency, deadline: input.deadline ?? null, notes: input.notes || null, createdById: user.id,
        lines: { create: lines },
        vendors: { create: [...new Set(input.vendorIds)].map((vendorId) => ({ vendorId })) },
      },
    });
    if (input.requisitionId) await tx.requisition.update({ where: { id: input.requisitionId }, data: { status: "SOURCING", updatedById: user.id, version: { increment: 1 } } });
    return created;
  });
  return getRfq(rfq.id);
}

export async function inviteVendors(rfqId: string, user: AuthUser, vendorIds: string[]): Promise<RfqDetail> {
  const rfq = await getRfq(rfqId);
  if (!["DRAFT", "SENT"].includes(rfq.status)) throw new AuthError(`Cannot invite vendors to a ${rfq.status.toLowerCase()} RFQ`, 409);
  await assertApprovedVendors(rfq.dataAreaId, vendorIds);
  const fresh = vendorIds.filter((id) => !rfq.vendors.some((v) => v.vendorId === id));
  if (fresh.length) await prisma.rfqVendor.createMany({ data: fresh.map((vendorId) => ({ rfqId, vendorId })) });
  await prisma.rfq.update({ where: { id: rfqId }, data: { updatedById: user.id, version: { increment: 1 } } });
  return getRfq(rfqId);
}

export async function removeVendor(rfqId: string, vendorId: string): Promise<RfqDetail> {
  const rfq = await getRfq(rfqId);
  if (!["DRAFT", "SENT"].includes(rfq.status)) throw new AuthError(`Cannot change vendors on a ${rfq.status.toLowerCase()} RFQ`, 409);
  if (rfq.quotations.some((q) => q.vendorId === vendorId)) throw new AuthError("This vendor has already quoted; the quote stays on record", 409);
  await prisma.rfqVendor.deleteMany({ where: { rfqId, vendorId } });
  return getRfq(rfqId);
}

/**
 * Send the RFQ: invitations are recorded as dispatched. Fewer vendors than
 * the policy's minimum is allowed here, because a quote may come from
 * anyone invited; the three-quote rule bites at the award.
 */
export async function sendRfq(rfqId: string, user: AuthUser): Promise<RfqDetail & { warning: string | null }> {
  const rfq = await getRfq(rfqId);
  if (rfq.status !== "DRAFT") throw new AuthError(`Only a draft RFQ can be sent (this one is ${rfq.status.toLowerCase()})`, 409);
  if (rfq.vendors.length === 0) throw new AuthError("Invite at least one vendor before sending", 422);
  const policy = await policyFor(rfq.dataAreaId);
  await prisma.rfq.update({ where: { id: rfqId }, data: { status: "SENT", sentAt: new Date(), updatedById: user.id, version: { increment: 1 } } });
  const warning = rfq.vendors.length < policy.minQuotes ? `Sent to ${rfq.vendors.length} vendor(s); the policy needs ${policy.minQuotes} quotes to award without a single-source justification.` : null;
  return { ...(await getRfq(rfqId)), warning };
}

export async function closeRfq(rfqId: string, user: AuthUser): Promise<RfqDetail> {
  const rfq = await getRfq(rfqId);
  if (rfq.status !== "SENT") throw new AuthError(`Only a sent RFQ can be closed (this one is ${rfq.status.toLowerCase()})`, 409);
  await prisma.rfq.update({ where: { id: rfqId }, data: { status: "CLOSED", closedAt: new Date(), updatedById: user.id, version: { increment: 1 } } });
  return getRfq(rfqId);
}

export async function cancelRfq(rfqId: string, user: AuthUser): Promise<RfqDetail> {
  const rfq = await getRfq(rfqId);
  if (rfq.status === "AWARDED") throw new AuthError("An awarded RFQ cannot be cancelled; cancel the purchase order", 409);
  await prisma.$transaction(async (tx) => {
    await tx.rfq.update({ where: { id: rfqId }, data: { status: "CANCELLED", updatedById: user.id, version: { increment: 1 } } });
    if (rfq.requisitionId) {
      const open = await tx.rfq.count({ where: { requisitionId: rfq.requisitionId, status: { in: ["DRAFT", "SENT", "CLOSED"] } } });
      if (open === 0) await tx.requisition.update({ where: { id: rfq.requisitionId }, data: { status: "APPROVED", updatedById: user.id, version: { increment: 1 } } });
    }
  });
  return getRfq(rfqId);
}

/** Enter (or replace) a vendor's quote. Every RFQ line must be priced. */
export async function enterQuotation(rfqId: string, user: AuthUser, input: QuotationInput): Promise<RfqDetail> {
  const rfq = await getRfq(rfqId);
  if (!["SENT", "CLOSED"].includes(rfq.status)) throw new AuthError(`Quotes can be entered on a sent or closed RFQ (this one is ${rfq.status.toLowerCase()})`, 409);
  if (!rfq.vendors.some((v) => v.vendorId === input.vendorId)) throw new AuthError("This vendor was not invited; invite them first", 422);
  const priced = new Map(input.lines.map((l) => [l.rfqLineId, l]));
  const missing = rfq.lines.filter((l) => !priced.has(l.id));
  if (missing.length) throw new AuthError(`No price for: ${missing.map((l) => l.description).join(", ")}`, 422);
  const lines = rfq.lines.map((l) => {
    const q = priced.get(l.id)!;
    return { rfqLineId: l.id, unitPrice: D(q.unitPrice), lineTotal: D(q.unitPrice).times(l.quantity).toDecimalPlaces(2), leadDays: q.leadDays ?? null, note: q.note || null };
  });
  const subtotal = lines.reduce((s, l) => s.plus(l.lineTotal), D(0));
  await prisma.$transaction(async (tx) => {
    const existing = await tx.quotation.findUnique({ where: { rfqId_vendorId: { rfqId, vendorId: input.vendorId } } });
    if (existing) await tx.quotation.delete({ where: { id: existing.id } });
    await tx.quotation.create({
      data: {
        dataAreaId: rfq.dataAreaId, rfqId, vendorId: input.vendorId, quoteRef: input.quoteRef || null, currency: input.currency || rfq.currency,
        receivedAt: input.receivedAt ?? new Date(), validUntil: input.validUntil ?? null, deliveryDays: input.deliveryDays ?? null,
        paymentTerms: input.paymentTerms || null, incoterm: input.incoterm || null, notes: input.notes || null, subtotal, createdById: user.id,
        lines: { create: lines },
      },
    });
    await tx.rfqVendor.update({ where: { rfqId_vendorId: { rfqId, vendorId: input.vendorId } }, data: { status: "QUOTED" } });
  });
  return getRfq(rfqId);
}

export async function declineQuotation(rfqId: string, vendorId: string, note?: string | null): Promise<RfqDetail> {
  const rfq = await getRfq(rfqId);
  if (!rfq.vendors.some((v) => v.vendorId === vendorId)) throw new AuthError("This vendor was not invited", 422);
  await prisma.rfqVendor.update({ where: { rfqId_vendorId: { rfqId, vendorId } }, data: { status: "DECLINED", note: note || null } });
  return getRfq(rfqId);
}

/** Record the negotiated prices beside the first quote, so the saving is visible. */
export async function negotiate(quotationId: string, user: AuthUser, input: NegotiationInput): Promise<RfqDetail> {
  const q = await prisma.quotation.findUnique({ where: { id: quotationId }, include: { lines: { include: { rfqLine: true } }, rfq: { select: { status: true } } } });
  if (!q) throw new AuthError("Quotation not found", 404);
  if (q.rfq.status === "AWARDED") throw new AuthError("The RFQ is already awarded", 409);
  const byLine = new Map(input.lines.map((l) => [l.rfqLineId, l.negotiatedUnitPrice]));
  let total = D(0);
  await prisma.$transaction(async (tx) => {
    for (const l of q.lines) {
      const price = byLine.has(l.rfqLineId) ? byLine.get(l.rfqLineId) : l.negotiatedUnitPrice;
      const effective = price == null ? l.unitPrice : D(price);
      total = total.plus(effective.times(l.rfqLine.quantity));
      if (byLine.has(l.rfqLineId)) await tx.quotationLine.update({ where: { id: l.id }, data: { negotiatedUnitPrice: price == null ? null : D(price) } });
    }
    const anyNegotiated = q.lines.some((l) => (byLine.has(l.rfqLineId) ? byLine.get(l.rfqLineId) != null : l.negotiatedUnitPrice != null));
    await tx.quotation.update({
      where: { id: quotationId },
      data: { negotiatedSubtotal: anyNegotiated ? total.toDecimalPlaces(2) : null, notes: input.notes ?? q.notes, updatedById: user.id, version: { increment: 1 } },
    });
  });
  return getRfq(q.rfqId);
}

export async function scoreQuotation(quotationId: string, user: AuthUser, input: QuoteScoreInput): Promise<RfqDetail> {
  const q = await prisma.quotation.findUnique({ where: { id: quotationId }, select: { rfqId: true } });
  if (!q) throw new AuthError("Quotation not found", 404);
  await prisma.$transaction(async (tx) => {
    if (input.isRecommended) await tx.quotation.updateMany({ where: { rfqId: q.rfqId }, data: { isRecommended: false } });
    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        ...(input.technicalScore !== undefined ? { technicalScore: input.technicalScore } : {}),
        ...(input.commercialScore !== undefined ? { commercialScore: input.commercialScore } : {}),
        ...(input.isRecommended !== undefined ? { isRecommended: input.isRecommended } : {}),
        updatedById: user.id, version: { increment: 1 },
      },
    });
  });
  return getRfq(q.rfqId);
}

/** An authorised person records why fewer than the policy's quotes will do. */
export async function singleSource(rfqId: string, user: AuthUser, justification: string): Promise<RfqDetail> {
  const rfq = await getRfq(rfqId);
  if (rfq.status === "AWARDED" || rfq.status === "CANCELLED") throw new AuthError(`The RFQ is ${rfq.status.toLowerCase()}`, 409);
  await prisma.rfq.update({
    where: { id: rfqId },
    data: { singleSourceJustification: justification, singleSourceApprovedById: user.id, singleSourceApprovedAt: new Date(), updatedById: user.id, version: { increment: 1 } },
  });
  return getRfq(rfqId);
}

// ── Comparison ───────────────────────────────────────────────────────────────

export interface ComparisonColumn {
  quotationId: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  currency: string;
  subtotal: string;
  negotiatedSubtotal: string | null;
  /** subtotal - negotiated, when negotiated. */
  saving: string | null;
  savingPct: string | null;
  deliveryDays: number | null;
  paymentTerms: string | null;
  incoterm: string | null;
  validUntil: Date | null;
  technicalScore: string | null;
  commercialScore: string | null;
  isRecommended: boolean;
  /** Lines where this vendor is cheapest (effective price). */
  cheapestLines: number;
}

export interface ComparisonRow {
  rfqLineId: string;
  description: string;
  quantity: string;
  uom: string;
  cells: { quotationId: string; unitPrice: string; negotiatedUnitPrice: string | null; effective: string; lineTotal: string; leadDays: number | null; cheapest: boolean }[];
}

export interface Comparison {
  rfq: Pick<Rfq, "id" | "rfqNumber" | "title" | "currency" | "status" | "deadline" | "singleSourceJustification" | "singleSourceApprovedAt">;
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  quoteCount: number;
  minQuotes: number;
  canAward: boolean;
  awardBlockedBy: string | null;
  cheapestQuotationId: string | null;
}

/** The side-by-side matrix (SOP step 8). Pure once the RFQ is loaded. */
export function buildComparison(rfq: RfqDetail, minQuotes: number): Comparison {
  const quotes = rfq.quotations;
  const columns: ComparisonColumn[] = quotes.map((q) => {
    const negotiated = q.negotiatedSubtotal;
    const saving = negotiated == null ? null : D(q.subtotal).minus(negotiated);
    return {
      quotationId: q.id, vendorId: q.vendorId, vendorCode: q.vendor.code, vendorName: q.vendor.legalName, currency: q.currency,
      subtotal: D(q.subtotal).toFixed(2), negotiatedSubtotal: negotiated == null ? null : D(negotiated).toFixed(2),
      saving: saving == null ? null : saving.toFixed(2),
      savingPct: saving == null || D(q.subtotal).isZero() ? null : saving.dividedBy(q.subtotal).times(100).toFixed(1),
      deliveryDays: q.deliveryDays, paymentTerms: q.paymentTerms, incoterm: q.incoterm, validUntil: q.validUntil,
      technicalScore: q.technicalScore == null ? null : D(q.technicalScore).toFixed(1),
      commercialScore: q.commercialScore == null ? null : D(q.commercialScore).toFixed(1),
      isRecommended: q.isRecommended, cheapestLines: 0,
    };
  });
  const rows: ComparisonRow[] = rfq.lines.map((l) => {
    const cells = quotes.map((q) => {
      const ql = q.lines.find((x) => x.rfqLineId === l.id);
      const unit = ql ? D(ql.unitPrice) : null;
      const neg = ql?.negotiatedUnitPrice == null ? null : D(ql.negotiatedUnitPrice);
      const effective = neg ?? unit ?? D(0);
      return { quotationId: q.id, unitPrice: unit ? unit.toFixed(2) : "", negotiatedUnitPrice: neg ? neg.toFixed(2) : null, effective: effective.toFixed(2), lineTotal: effective.times(l.quantity).toFixed(2), leadDays: ql?.leadDays ?? null, cheapest: false, _eff: effective, _has: !!ql };
    });
    const priced = cells.filter((c) => c._has);
    if (priced.length) {
      const min = priced.reduce((m, c) => (c._eff.lessThan(m) ? c._eff : m), priced[0]._eff);
      for (const c of cells) if (c._has && c._eff.equals(min)) { c.cheapest = true; columns.find((col) => col.quotationId === c.quotationId)!.cheapestLines++; }
    }
    return { rfqLineId: l.id, description: l.description, quantity: D(l.quantity).toFixed(3), uom: l.uom, cells: cells.map(({ _eff: _e, _has: _h, ...c }) => c) };
  });
  const effectiveTotal = (c: ComparisonColumn) => D(c.negotiatedSubtotal ?? c.subtotal);
  const cheapest = columns.length ? columns.reduce((m, c) => (effectiveTotal(c).lessThan(effectiveTotal(m)) ? c : m), columns[0]) : null;
  const singleSourced = !!rfq.singleSourceApprovedAt;
  const enough = quotes.length >= minQuotes;
  const awardBlockedBy = quotes.length === 0 ? "No quotations yet"
    : !enough && !singleSourced ? `${quotes.length} of ${minQuotes} quotes; add more or record a single-source justification`
    : !["SENT", "CLOSED"].includes(rfq.status) ? `RFQ is ${rfq.status.toLowerCase()}` : null;
  return {
    rfq: { id: rfq.id, rfqNumber: rfq.rfqNumber, title: rfq.title, currency: rfq.currency, status: rfq.status, deadline: rfq.deadline, singleSourceJustification: rfq.singleSourceJustification, singleSourceApprovedAt: rfq.singleSourceApprovedAt },
    columns, rows, quoteCount: quotes.length, minQuotes, canAward: awardBlockedBy === null, awardBlockedBy, cheapestQuotationId: cheapest?.quotationId ?? null,
  };
}

export async function comparison(rfqId: string): Promise<Comparison> {
  const rfq = await getRfq(rfqId);
  const policy = await policyFor(rfq.dataAreaId);
  return buildComparison(rfq, policy.minQuotes);
}
