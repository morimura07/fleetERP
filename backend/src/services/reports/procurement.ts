import { prisma } from "@backend/lib/prisma";
import { defineReport } from "@backend/services/report-registry";
import { scorecardsFor, quarterBounds } from "@backend/services/governance";

/**
 * Procurement reports (client requirements, Sept 2026, Procurement §6 and
 * the executive dashboard): the quarterly vendor scorecard and the cost
 * savings tracker.
 */

function dateWindow(field: string, from: Date | null, to: Date | null) {
  return from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
}

interface ScorecardRow {
  vendor: string; vendorName: string; orders: number; spend: number; currency: string;
  onTimePct: number | null; onTime: number; late: number; qualityPct: number | null; rejected: number; returns: number;
  priceVariancePct: number | null; matchVariances: number; rfqResponsePct: number | null; score: number | null; rating: string;
}

export const vendorScorecardReport = defineReport<ScorecardRow>({
  key: "vendor-scorecard",
  title: "Quarterly vendor scorecard",
  group: "COMPLIANCE",
  description: "Every vendor with orders in the quarter, rated on on-time delivery, quality pass rate and price variance.",
  permission: "procurement:read",
  params: [{ name: "period", label: "Quarter (YYYY-Qn)", kind: "period", required: true }],
  columns: [
    { header: "Vendor", value: (r) => r.vendor, width: 10 },
    { header: "Name", value: (r) => r.vendorName, width: 22 },
    { header: "Orders", value: (r) => r.orders, width: 8 },
    { header: "Spend", value: (r) => r.spend, width: 12 },
    { header: "Currency", value: (r) => r.currency, width: 8 },
    { header: "On time %", value: (r) => r.onTimePct ?? "", width: 9 },
    { header: "On time", value: (r) => r.onTime, width: 8 },
    { header: "Late", value: (r) => r.late, width: 7 },
    { header: "Quality pass %", value: (r) => r.qualityPct ?? "", width: 11 },
    { header: "Rejected units", value: (r) => r.rejected, width: 11 },
    { header: "Returns", value: (r) => r.returns, width: 8 },
    { header: "Price variance %", value: (r) => r.priceVariancePct ?? "", width: 12 },
    { header: "Match variances", value: (r) => r.matchVariances, width: 12 },
    { header: "RFQ response %", value: (r) => r.rfqResponsePct ?? "", width: 12 },
    { header: "Score", value: (r) => r.score ?? "", width: 7 },
    { header: "Rating", value: (r) => r.rating, width: 7 },
  ],
  run: async (ctx) => {
    const quarter = ctx.params.period;
    quarterBounds(quarter);
    const cards = await scorecardsFor(ctx.dataAreaId, quarter);
    return cards.map((c) => ({
      vendor: c.vendorCode, vendorName: c.vendorName, orders: c.orders, spend: Number(c.spend), currency: c.currency,
      onTimePct: c.onTimeDeliveryPct, onTime: c.onTime, late: c.late, qualityPct: c.qualityPassPct, rejected: Number(c.qtyRejected), returns: c.returns,
      priceVariancePct: c.priceVariancePct, matchVariances: c.matchVariances, rfqResponsePct: c.rfqResponsePct, score: c.score, rating: c.rating ?? "",
    }));
  },
  summary: (rows) => [
    { label: "Vendors rated", value: String(rows.length) },
    { label: "A-rated", value: String(rows.filter((r) => r.rating === "A").length) },
    { label: "D-rated", value: String(rows.filter((r) => r.rating === "D").length), hint: "review or suspend" },
  ],
});

interface SavingsRow { po: string; vendor: string; rfq: string; currency: string; firstQuote: number; finalPrice: number; saved: number; savedPct: number | null; awardedAt: string }

export const savingsReport = defineReport<SavingsRow>({
  key: "procurement-savings",
  title: "Cost savings tracker",
  group: "FINANCE",
  description: "Every sourced order: the winning vendor's first quote against the negotiated price it was placed at.",
  permission: "procurement:read",
  params: [
    { name: "from", label: "From", kind: "date", required: true },
    { name: "to", label: "To", kind: "date", required: true },
  ],
  columns: [
    { header: "PO", value: (r) => r.po, width: 12 },
    { header: "Vendor", value: (r) => r.vendor, width: 20 },
    { header: "RFQ", value: (r) => r.rfq, width: 12 },
    { header: "Currency", value: (r) => r.currency, width: 8 },
    { header: "First quote", value: (r) => r.firstQuote, width: 13 },
    { header: "Final price", value: (r) => r.finalPrice, width: 13 },
    { header: "Saved", value: (r) => r.saved, width: 12 },
    { header: "Saved %", value: (r) => r.savedPct ?? "", width: 8 },
    { header: "Awarded", value: (r) => r.awardedAt, width: 11 },
  ],
  run: async (ctx) => {
    const pos = await prisma.purchaseOrder.findMany({
      where: { dataAreaId: ctx.dataAreaId, initialQuoteTotal: { not: null }, status: { not: "CANCELLED" }, ...dateWindow("orderDate", ctx.from, ctx.to) },
      include: { vendor: { select: { legalName: true } }, rfq: { select: { rfqNumber: true, awardedAt: true } } },
      orderBy: { orderDate: "desc" },
    });
    return pos.map((p) => {
      const first = Number(p.initialQuoteTotal); const final = Number(p.subtotal);
      return { po: p.poNumber, vendor: p.vendor.legalName, rfq: p.rfq?.rfqNumber ?? "", currency: p.currency, firstQuote: first, finalPrice: final, saved: Math.round((first - final) * 100) / 100, savedPct: first ? Math.round(((first - final) / first) * 1000) / 10 : null, awardedAt: (p.rfq?.awardedAt ?? p.orderDate).toISOString().slice(0, 10) };
    });
  },
  summary: (rows) => {
    const first = rows.reduce((s, r) => s + r.firstQuote, 0); const final = rows.reduce((s, r) => s + r.finalPrice, 0);
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return [
      { label: "Sourced orders", value: String(rows.length) },
      { label: "First quotes", value: fmt(first) },
      { label: "Placed at", value: fmt(final) },
      { label: "Saved", value: fmt(first - final), hint: first ? `${Math.round(((first - final) / first) * 1000) / 10}%` : undefined },
    ];
  },
});
