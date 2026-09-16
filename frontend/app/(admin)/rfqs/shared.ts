import type { RfqStatus, AvlRegion } from "@frontend/lib/enums";

export interface ApprovedVendor { id: string; code: string; legalName: string; avlRegion: AvlRegion | null; currency: string; email: string | null; categories: string[]; paymentTerm: string }
export interface ItemOpt { id: string; code: string; name: string; unit: string; expenseCode: string }
export interface RequisitionOpt { id: string; prNumber: string; title: string; status: string; currency: string; subtotal: string }

export interface RfqLine { id: string; description: string; uom: string; quantity: string; expenseCode: string; specification: string | null }
export interface RfqVendorRow { id: string; vendorId: string; status: "INVITED" | "QUOTED" | "DECLINED"; note: string | null; vendor: { id: string; code: string; legalName: string; avlRegion: AvlRegion | null; currency: string; email: string | null } }
export interface QuotationRow {
  id: string; vendorId: string; quoteRef: string | null; currency: string; receivedAt: string; validUntil: string | null; deliveryDays: number | null; paymentTerms: string | null; incoterm: string | null;
  subtotal: string; negotiatedSubtotal: string | null; technicalScore: string | null; commercialScore: string | null; notes: string | null; isRecommended: boolean;
  lines: { id: string; rfqLineId: string; unitPrice: string; negotiatedUnitPrice: string | null; lineTotal: string; leadDays: number | null; note: string | null }[];
  vendor: { id: string; code: string; legalName: string };
}
export interface RfqRow {
  id: string; rfqNumber: string; title: string; status: RfqStatus; currency: string; deadline: string | null; sentAt: string | null; createdAt: string; requisitionId: string | null;
  requisition?: { prNumber: string } | null; _count?: { vendors: number; quotations: number; lines: number };
}
export interface RfqDetail extends RfqRow {
  notes: string | null; singleSourceJustification: string | null; singleSourceApprovedAt: string | null; awardedQuotationId: string | null; version: number;
  lines: RfqLine[]; vendors: RfqVendorRow[]; quotations: QuotationRow[];
}
export interface Comparison {
  rfq: { id: string; rfqNumber: string; currency: string; status: RfqStatus };
  columns: { quotationId: string; vendorId: string; vendorCode: string; vendorName: string; currency: string; subtotal: string; negotiatedSubtotal: string | null; saving: string | null; savingPct: string | null; deliveryDays: number | null; paymentTerms: string | null; incoterm: string | null; validUntil: string | null; technicalScore: string | null; commercialScore: string | null; isRecommended: boolean; cheapestLines: number }[];
  rows: { rfqLineId: string; description: string; quantity: string; uom: string; cells: { quotationId: string; unitPrice: string; negotiatedUnitPrice: string | null; effective: string; lineTotal: string; leadDays: number | null; cheapest: boolean }[] }[];
  quoteCount: number; minQuotes: number; canAward: boolean; awardBlockedBy: string | null; cheapestQuotationId: string | null;
}

export const money = (v: string | number, c: string) => `${c} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
