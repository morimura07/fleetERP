import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { policyFor } from "@backend/services/doa";

/**
 * Vendor governance and the procurement KPIs (client requirements, Sept
 * 2026, Procurement §6 and the executive dashboard): the quarterly vendor
 * scorecard, the turnaround / on-time / savings figures, and the audit
 * vault view of one order. All derived from what the process recorded;
 * nothing here is a stored rating.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const DAY = 86_400_000;
const pct = (num: number, den: number) => (den === 0 ? null : Math.round((num / den) * 1000) / 10);

export function quarterBounds(quarter: string): { start: Date; end: Date; label: string } {
  const m = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!m) throw new AuthError("Quarter must be YYYY-Qn", 422);
  const y = Number(m[1]); const q = Number(m[2]);
  return { start: new Date(Date.UTC(y, (q - 1) * 3, 1)), end: new Date(Date.UTC(y, q * 3, 1)), label: quarter };
}

export interface Scorecard {
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  period: { start: Date; end: Date; label: string };
  orders: number;
  /** Orders delivered (first receipt) on or before the committed or expected date, as a % of orders with a date and a receipt. */
  onTimeDeliveryPct: number | null;
  onTime: number;
  late: number;
  /** Accepted / received across inspected receipt lines. */
  qualityPassPct: number | null;
  qtyReceived: string;
  qtyAccepted: string;
  qtyRejected: string;
  returns: number;
  /** Invoice subtotal against PO value at accepted quantities, across matched orders; positive = billed more. */
  priceVariancePct: number | null;
  matchedOrders: number;
  matchVariances: number;
  /** Quotes returned / invitations in the quarter. */
  rfqResponsePct: number | null;
  invited: number;
  quoted: number;
  spend: string;
  currency: string;
  /** Weighted score: OTD 40, quality 40, price 20; null when nothing to score. */
  score: number | null;
  rating: "A" | "B" | "C" | "D" | null;
}

/** The quarterly rating the SOP asks for (step 24). */
export async function vendorScorecard(vendorId: string, quarter: string): Promise<Scorecard> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, code: true, legalName: true, currency: true, dataAreaId: true } });
  if (!vendor) throw new AuthError("Vendor not found", 404);
  const period = quarterBounds(quarter);
  const orders = await prisma.purchaseOrder.findMany({
    where: { vendorId, orderDate: { gte: period.start, lt: period.end }, status: { not: "CANCELLED" } },
    include: { receipts: { include: { lines: { select: { quantity: true, qtyAccepted: true, qtyRejected: true, qaStatus: true } } }, orderBy: { receivedAt: "asc" } }, vendorInvoice: { select: { subtotal: true } }, lines: { select: { quantity: true, qtyAccepted: true, unitPrice: true } } },
  });
  let onTime = 0, late = 0;
  let received = D(0), accepted = D(0), rejected = D(0);
  let matched = 0, variances = 0;
  let billed = D(0), expected = D(0);
  let spend = D(0);
  for (const po of orders) {
    spend = spend.plus(po.subtotal);
    const due = po.committedDeliveryDate ?? po.expectedAt;
    const first = po.receipts[0]?.receivedAt;
    if (due && first) { if (first.getTime() <= due.getTime() + DAY - 1) onTime++; else late++; }
    for (const r of po.receipts) for (const l of r.lines) {
      if (l.qaStatus === "PASSED" || l.qaStatus === "FAILED") { received = received.plus(l.quantity); accepted = accepted.plus(l.qtyAccepted); rejected = rejected.plus(l.qtyRejected); }
    }
    if (po.matchStatus !== "UNMATCHED" && po.vendorInvoice) {
      matched++;
      if (po.matchStatus === "VARIANCE") variances++;
      billed = billed.plus(po.vendorInvoice.subtotal);
      expected = expected.plus(po.lines.reduce((s, l) => s.plus(D(l.qtyAccepted).times(l.unitPrice)), D(0)));
    }
  }
  const returns = await prisma.returnToVendor.count({ where: { vendorId, createdAt: { gte: period.start, lt: period.end } } });
  const [invited, quoted] = await Promise.all([
    prisma.rfqVendor.count({ where: { vendorId, invitedAt: { gte: period.start, lt: period.end } } }),
    prisma.rfqVendor.count({ where: { vendorId, invitedAt: { gte: period.start, lt: period.end }, status: "QUOTED" } }),
  ]);
  const onTimeDeliveryPct = pct(onTime, onTime + late);
  const qualityPassPct = received.isZero() ? null : Math.round(accepted.dividedBy(received).times(1000).toNumber()) / 10;
  const priceVariancePct = expected.isZero() ? null : Math.round(billed.minus(expected).dividedBy(expected).times(1000).toNumber()) / 10;
  // Price scores 100 at no variance, falling 10 points per percent over.
  const priceScore = priceVariancePct == null ? null : Math.max(0, 100 - Math.max(0, priceVariancePct) * 10);
  const parts = [[onTimeDeliveryPct, 40], [qualityPassPct, 40], [priceScore, 20]].filter((p): p is [number, number] => p[0] != null);
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  const score = weight === 0 ? null : Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / weight);
  const rating = score == null ? null : score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "D";
  return {
    vendorId: vendor.id, vendorCode: vendor.code, vendorName: vendor.legalName, period, orders: orders.length,
    onTimeDeliveryPct, onTime, late, qualityPassPct, qtyReceived: received.toFixed(3), qtyAccepted: accepted.toFixed(3), qtyRejected: rejected.toFixed(3), returns,
    priceVariancePct, matchedOrders: matched, matchVariances: variances, rfqResponsePct: pct(quoted, invited), invited, quoted,
    spend: spend.toFixed(2), currency: vendor.currency, score, rating,
  };
}

export async function scorecardsFor(dataAreaId: string, quarter: string): Promise<Scorecard[]> {
  const period = quarterBounds(quarter);
  const vendorIds = await prisma.purchaseOrder.findMany({ where: { dataAreaId, orderDate: { gte: period.start, lt: period.end }, status: { not: "CANCELLED" } }, select: { vendorId: true }, distinct: ["vendorId"] });
  const cards = await Promise.all(vendorIds.map((v) => vendorScorecard(v.vendorId, quarter)));
  return cards.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export interface ProcurementKpis {
  from: Date; to: Date;
  turnaround: { orders: number; averageDays: number | null; withinSlaPct: number | null; slaDays: number };
  onTimeDelivery: { orders: number; pct: number | null };
  savings: { orders: number; initial: string; final: string; saved: string; pct: number | null };
  pipeline: { requisitionsOpen: number; rfqsOpen: number; posPendingApproval: number; posOpen: number; invoicesOnHold: number };
  spendByVendor: { vendorCode: string; vendorName: string; orders: number; spend: string }[];
}

/** The executive figures (client requirements: turnaround against the SLA, OTD, savings). */
export async function procurementKpis(dataAreaId: string, from: Date, to: Date): Promise<ProcurementKpis> {
  const policy = await policyFor(dataAreaId);
  const pos = await prisma.purchaseOrder.findMany({
    where: { dataAreaId, orderDate: { gte: from, lte: to }, status: { not: "CANCELLED" } },
    include: { requisition: { select: { approvedAt: true } }, receipts: { select: { receivedAt: true }, orderBy: { receivedAt: "asc" }, take: 1 }, vendor: { select: { code: true, legalName: true } } },
  });
  // Turnaround: requisition approval to PO issue, in days.
  const turn = pos.filter((p) => p.requisition?.approvedAt && p.issuedAt).map((p) => (p.issuedAt!.getTime() - p.requisition!.approvedAt!.getTime()) / DAY);
  const within = turn.filter((d) => d <= policy.poTurnaroundSlaDays).length;
  // OTD: first receipt against the committed or expected date.
  let onTime = 0, dated = 0;
  for (const p of pos) {
    const due = p.committedDeliveryDate ?? p.expectedAt; const first = p.receipts[0]?.receivedAt;
    if (due && first) { dated++; if (first.getTime() <= due.getTime() + DAY - 1) onTime++; }
  }
  const sourced = pos.filter((p) => p.initialQuoteTotal != null);
  const initial = sourced.reduce((s, p) => s.plus(p.initialQuoteTotal!), D(0));
  const final = sourced.reduce((s, p) => s.plus(p.subtotal), D(0));
  const [requisitionsOpen, rfqsOpen, posPendingApproval, posOpen, invoicesOnHold] = await Promise.all([
    prisma.requisition.count({ where: { dataAreaId, status: { in: ["PENDING_REVIEW", "PENDING_BUDGET", "PENDING_APPROVAL"] } } }),
    prisma.rfq.count({ where: { dataAreaId, status: { in: ["DRAFT", "SENT", "CLOSED"] } } }),
    prisma.purchaseOrder.count({ where: { dataAreaId, status: "PENDING_APPROVAL" } }),
    prisma.purchaseOrder.count({ where: { dataAreaId, status: { in: ["APPROVED", "ISSUED", "ACKNOWLEDGED", "IN_PRODUCTION", "DISPATCHED", "PARTIAL"] } } }),
    prisma.vendorInvoice.count({ where: { dataAreaId, paymentHold: true } }),
  ]);
  const byVendor = new Map<string, { vendorCode: string; vendorName: string; orders: number; spend: Prisma.Decimal }>();
  for (const p of pos) {
    const row = byVendor.get(p.vendorId) ?? { vendorCode: p.vendor.code, vendorName: p.vendor.legalName, orders: 0, spend: D(0) };
    row.orders++; row.spend = row.spend.plus(p.subtotal); byVendor.set(p.vendorId, row);
  }
  return {
    from, to,
    turnaround: { orders: turn.length, averageDays: turn.length ? Math.round((turn.reduce((s, d) => s + d, 0) / turn.length) * 10) / 10 : null, withinSlaPct: pct(within, turn.length), slaDays: policy.poTurnaroundSlaDays },
    onTimeDelivery: { orders: dated, pct: pct(onTime, dated) },
    savings: { orders: sourced.length, initial: initial.toFixed(2), final: final.toFixed(2), saved: initial.minus(final).toFixed(2), pct: initial.isZero() ? null : Math.round(initial.minus(final).dividedBy(initial).times(1000).toNumber()) / 10 },
    pipeline: { requisitionsOpen, rfqsOpen, posPendingApproval, posOpen, invoicesOnHold },
    spendByVendor: [...byVendor.values()].map((r) => ({ ...r, spend: r.spend.toFixed(2) })).sort((a, b) => Number(b.spend) - Number(a.spend)).slice(0, 10),
  };
}

// ── Audit vault ──────────────────────────────────────────────────────────────

export interface TimelineEntry {
  at: Date;
  kind: string;
  ref: string;
  title: string;
  detail: string | null;
  by: string | null;
}

/**
 * Everything that happened to one order, in time order: the requisition
 * and its gates, every approval signature, the RFQ and the quotes, the
 * order's own milestones, shipments and their logs, receipts and
 * inspections, returns, the match and the bill, plus the activity log for
 * each record. Read-only; the records it reads are the audit trail.
 */
export async function poTimeline(poId: string): Promise<{ poNumber: string; entries: TimelineEntry[] }> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      requisition: true, rfq: { include: { quotations: { include: { vendor: { select: { code: true } } } }, vendors: { include: { vendor: { select: { code: true } } } } } },
      shipments: { include: { events: true, documents: true } },
      receipts: { include: { lines: { include: { purchaseOrderLine: { select: { description: true } }, returns: true } } } },
      vendorInvoice: true, vendor: { select: { legalName: true } },
    },
  });
  if (!po) throw new AuthError("Purchase order not found", 404);
  const e: TimelineEntry[] = [];
  const push = (at: Date | null | undefined, kind: string, ref: string, title: string, detail?: string | null, by?: string | null) => { if (at) e.push({ at, kind, ref, title, detail: detail ?? null, by: by ?? null }); };

  const users = new Map<string, string>();
  const userName = async (id: string | null | undefined) => {
    if (!id) return null;
    if (!users.has(id)) { const u = await prisma.user.findUnique({ where: { id }, select: { name: true } }); users.set(id, u?.name ?? id); }
    return users.get(id)!;
  };

  const r = po.requisition;
  if (r) {
    push(r.createdAt, "requisition", r.prNumber, "Requisition raised", r.title, await userName(r.requestedById));
    push(r.submittedAt, "requisition", r.prNumber, "Submitted for technical review");
    push(r.reviewedAt, "requisition", r.prNumber, "Technical review", r.reviewNote, await userName(r.reviewedById));
    if (r.budgetStatus !== "NOT_CHECKED") push(r.reviewedAt, "budget", r.prNumber, `Budget gate: ${r.budgetStatus.toLowerCase().replace("_", " ")}`, r.budgetNote);
    push(r.budgetOverrideAt, "budget", r.prNumber, "Budget overridden", r.budgetOverrideNote, await userName(r.budgetOverrideById));
    push(r.approvedAt, "approval", r.prNumber, "Requisition approved");
  }
  const subjects = [{ type: "REQUISITION" as const, id: po.requisitionId }, { type: "PURCHASE_ORDER" as const, id: po.id }].filter((s) => s.id);
  for (const s of subjects) {
    const reqs = await prisma.approvalRequest.findMany({ where: { subjectType: s.type, subjectId: s.id! }, include: { decisions: true } });
    for (const a of reqs) {
      push(a.createdAt, "approval", a.subjectRef, `Approval opened: ${a.tierName}`, `${a.amountBase.toFixed(2)} ${a.baseCurrency} · ${a.reason ?? ""}`);
      for (const d of a.decisions) push(d.decidedAt, "approval", a.subjectRef, `${d.roleKey} ${d.status.toLowerCase()}`, d.note, d.userName);
      push(a.resolvedAt, "approval", a.subjectRef, `Approval ${a.status.toLowerCase()}`);
    }
  }
  const q = po.rfq;
  if (q) {
    push(q.createdAt, "rfq", q.rfqNumber, "RFQ raised", q.title);
    push(q.sentAt, "rfq", q.rfqNumber, `Sent to ${q.vendors.map((v) => v.vendor.code).join(", ")}`);
    for (const qt of q.quotations) push(qt.receivedAt, "quote", q.rfqNumber, `Quote from ${qt.vendor.code}`, `${qt.subtotal.toFixed(2)} ${qt.currency}${qt.negotiatedSubtotal ? `, negotiated to ${qt.negotiatedSubtotal.toFixed(2)}` : ""}`);
    push(q.singleSourceApprovedAt, "rfq", q.rfqNumber, "Single-source justification recorded", q.singleSourceJustification, await userName(q.singleSourceApprovedById));
    push(q.closedAt, "rfq", q.rfqNumber, "RFQ closed");
    push(q.awardedAt, "rfq", q.rfqNumber, "Awarded", null, await userName(q.awardedById));
  }
  push(po.createdAt, "order", po.poNumber, "Purchase order raised", `${po.subtotal.toFixed(2)} ${po.currency} · ${po.vendor.legalName}`, await userName(po.createdById));
  push(po.approvedAt, "order", po.poNumber, "Order approved", null, await userName(po.approvedById));
  push(po.issuedAt, "order", po.poNumber, "Issued to supplier");
  push(po.acknowledgedAt, "order", po.poNumber, "Acknowledged by supplier", po.committedDeliveryDate ? `committed ${po.committedDeliveryDate.toISOString().slice(0, 10)}` : po.supplierNote);
  push(po.inProductionAt, "order", po.poNumber, "In production");
  push(po.dispatchedAt, "order", po.poNumber, "Dispatched");
  for (const s of po.shipments) {
    for (const ev of s.events) push(ev.at, "shipment", s.shipmentNumber, [ev.kind.toLowerCase(), ev.status?.toLowerCase().replace(/_/g, " ")].filter(Boolean).join(": "), [ev.location, ev.note].filter(Boolean).join(" · "), ev.userName);
    for (const d of s.documents) push(d.verifiedAt, "document", s.shipmentNumber, `${d.docType.toLowerCase().replace(/_/g, " ")} verified`, d.reference, await userName(d.verifiedById));
    push(s.dutyPaidAt, "customs", s.shipmentNumber, "Duty paid", s.dutyPaid ? `${s.dutyPaid.toFixed(2)} ${s.dutyCurrency}` : null);
  }
  for (const gr of po.receipts) {
    push(gr.createdAt, "receipt", gr.receiptNumber, "Goods received", [gr.gateEntryNo && `gate ${gr.gateEntryNo}`, gr.deliveryNoteNo && `DN ${gr.deliveryNoteNo}`].filter(Boolean).join(" · "), await userName(gr.receivedById));
    for (const l of gr.lines) {
      push(l.inspectedAt, "inspection", gr.receiptNumber, `${l.purchaseOrderLine.description}: ${l.qaStatus.toLowerCase()}`, `accepted ${l.qtyAccepted}, rejected ${l.qtyRejected}${l.qaNote ? ` · ${l.qaNote}` : ""}`, await userName(l.inspectedById));
      for (const rt of l.returns) push(rt.createdAt, "return", rt.rtvNumber, `Return raised: ${rt.quantity}`, rt.reason, await userName(rt.createdById));
    }
  }
  push(po.matchedAt, "match", po.poNumber, `Three-way match: ${po.matchStatus.toLowerCase()}`, po.vendorInvoice ? `invoice ${po.vendorInvoice.invoiceNumber}` : null, await userName(po.matchedById));
  if (po.vendorInvoice) {
    push(po.vendorInvoice.createdAt, "invoice", po.vendorInvoice.invoiceNumber, "Vendor bill recorded", `${po.vendorInvoice.total.toFixed(2)} ${po.vendorInvoice.currency}`);
    push(po.vendorInvoice.paymentHoldSetAt, "invoice", po.vendorInvoice.invoiceNumber, "Payment voucher held", po.vendorInvoice.paymentHoldReason);
    const payments = await prisma.vendorPayment.findMany({ where: { invoiceId: po.vendorInvoice.id } });
    for (const p of payments) push(p.paidAt, "payment", po.vendorInvoice.invoiceNumber, "Paid", `${p.amount.toFixed(2)}`);
  }
  const targets = [`PurchaseOrder:${po.id}`, po.requisitionId && `Requisition:${po.requisitionId}`, po.rfqId && `Rfq:${po.rfqId}`, ...po.shipments.map((s) => `Shipment:${s.id}`)].filter((t): t is string => !!t);
  const logs = await prisma.activityLog.findMany({ where: { target: { in: targets } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  for (const l of logs) push(l.createdAt, "log", l.target.split(":")[0], l.action.toLowerCase().replace(/_/g, " "), l.detail, l.user?.name ?? null);

  return { poNumber: po.poNumber, entries: e.sort((a, b) => a.at.getTime() - b.at.getTime()) };
}
