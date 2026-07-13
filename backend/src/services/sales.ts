import { Prisma, LeadStage, QuoteStatus } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

/**
 * Sales & Marketing (M27). Two connected pieces:
 *   • Lead      — CRM pipeline (NEW→…→WON/LOST), owned by a salesperson.
 *   • SalesQuote — a priced freight quotation with line items; on acceptance it
 *     converts into a freight Order (M12), locking the quote as CONVERTED.
 * Quote totals are always recomputed from the lines so the header can't drift.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** A line's amount is quantity × unitPrice. */
export function lineAmount(quantity: Prisma.Decimal.Value, unitPrice: Prisma.Decimal.Value): Prisma.Decimal {
  return D(quantity).times(unitPrice);
}

/** A quote's total is the sum of its line amounts. */
export function quoteTotal(lines: { quantity: Prisma.Decimal.Value; unitPrice: Prisma.Decimal.Value }[]): Prisma.Decimal {
  return lines.reduce((s, l) => s.plus(lineAmount(l.quantity, l.unitPrice)), new Prisma.Decimal(0));
}

/**
 * Which manual status transitions are allowed. CONVERTED is reached only through
 * the convert action, so it is never a manual target and REJECTED/EXPIRED/
 * CONVERTED are terminal.
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["SENT", "REJECTED", "EXPIRED"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: ["REJECTED"],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED: [],
};

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

// ── Leads ────────────────────────────────────────────────────────────────────

export interface LeadInput {
  dataAreaId: string;
  companyName: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  stage?: LeadStage;
  estimatedValue?: Prisma.Decimal.Value;
  currency?: string;
  ownerId?: string | null;
  notes?: string | null;
  createdById?: string | null;
}

export async function createLead(input: LeadInput) {
  return prisma.lead.create({
    data: {
      dataAreaId: input.dataAreaId,
      companyName: input.companyName,
      contactPerson: input.contactPerson ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      source: input.source ?? null,
      stage: input.stage ?? "NEW",
      estimatedValue: D(input.estimatedValue ?? 0),
      currency: input.currency ?? "USD",
      ownerId: input.ownerId ?? null,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

export async function setLeadStage(dataAreaId: string, id: string, stage: LeadStage, userId?: string | null) {
  const lead = await prisma.lead.findFirst({ where: { id, dataAreaId }, select: { id: true } });
  if (!lead) throw new AuthError("Lead not found", 404);
  return prisma.lead.update({ where: { id: lead.id }, data: { stage, updatedById: userId ?? null } });
}

// ── Quotes ───────────────────────────────────────────────────────────────────

async function nextQuoteNumber(dataAreaId: string): Promise<string> {
  const n = await prisma.salesQuote.count({ where: { dataAreaId } });
  return `QUO-${String(n + 1).padStart(6, "0")}`;
}

export interface QuoteLineInput {
  description: string;
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
}

export interface QuoteInput {
  dataAreaId: string;
  clientId?: string | null;
  leadId?: string | null;
  salesperson?: string | null;
  originZone?: string | null;
  destinationZone?: string | null;
  cargoDescription?: string | null;
  currency?: string;
  validUntil: Date;
  notes?: string | null;
  lines: QuoteLineInput[];
  createdById?: string | null;
}

/** Create a quote with its priced lines; the header total is the Σ of line amounts. */
export async function createQuote(input: QuoteInput) {
  if (input.clientId) {
    const client = await prisma.client.findFirst({ where: { id: input.clientId, dataAreaId: input.dataAreaId }, select: { id: true } });
    if (!client) throw new AuthError("Client not found in this company", 404);
  }
  const lines = input.lines.map((l) => ({
    description: l.description,
    quantity: D(l.quantity),
    unitPrice: D(l.unitPrice),
    amount: lineAmount(l.quantity, l.unitPrice),
    dataAreaId: input.dataAreaId,
  }));
  const total = quoteTotal(input.lines);

  return prisma.salesQuote.create({
    data: {
      dataAreaId: input.dataAreaId,
      quoteNumber: await nextQuoteNumber(input.dataAreaId),
      clientId: input.clientId ?? null,
      leadId: input.leadId ?? null,
      salesperson: input.salesperson ?? null,
      originZone: input.originZone ?? null,
      destinationZone: input.destinationZone ?? null,
      cargoDescription: input.cargoDescription ?? null,
      currency: input.currency ?? "USD",
      total,
      validUntil: input.validUntil,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
      lines: { create: lines },
    },
    include: { lines: true },
  });
}

export async function setQuoteStatus(dataAreaId: string, id: string, status: QuoteStatus, userId?: string | null) {
  const quote = await prisma.salesQuote.findFirst({ where: { id, dataAreaId }, select: { id: true, status: true } });
  if (!quote) throw new AuthError("Quote not found", 404);
  if (status === "CONVERTED") throw new AuthError("Use the convert action to convert a quote", 422);
  if (!canTransition(quote.status, status)) {
    throw new AuthError(`Cannot move a ${quote.status} quote to ${status}`, 422);
  }
  return prisma.salesQuote.update({ where: { id: quote.id }, data: { status, updatedById: userId ?? null } });
}

/**
 * Convert an ACCEPTED quote into a freight Order (DRAFT). Requires a client and a
 * routing. The quote total becomes the order's freight amount. Atomic: the order
 * is created and the quote is linked + marked CONVERTED in one transaction.
 */
export async function convertQuoteToOrder(dataAreaId: string, id: string, userId?: string | null) {
  const quote = await prisma.salesQuote.findFirst({ where: { id, dataAreaId } });
  if (!quote) throw new AuthError("Quote not found", 404);
  if (quote.status !== "ACCEPTED") throw new AuthError("Only an ACCEPTED quote can be converted", 422);
  if (quote.convertedOrderId) throw new AuthError("Quote is already converted", 422);
  if (!quote.clientId) throw new AuthError("Attach a client before converting", 422);
  if (!quote.originZone || !quote.destinationZone) throw new AuthError("Set origin and destination before converting", 422);

  const orderCode = `ORD-${Date.now().toString().slice(-8)}`;
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        dataAreaId,
        orderCode,
        clientId: quote.clientId!,
        originZone: quote.originZone!,
        destinationZone: quote.destinationZone!,
        cargoDescription: quote.cargoDescription ?? "Freight per quote " + quote.quoteNumber,
        freightAmount: quote.total,
        currency: quote.currency,
        bookingDate: new Date(),
        salesperson: quote.salesperson,
        status: "DRAFT",
        createdById: userId ?? null,
      },
    });
    await tx.salesQuote.update({
      where: { id: quote.id },
      data: { status: "CONVERTED", convertedOrderId: order.id, updatedById: userId ?? null },
    });
    return order;
  });
}
