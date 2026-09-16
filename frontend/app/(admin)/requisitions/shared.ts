/** Types shared by the requisition screens, mirroring the API's shapes. */

export type RequisitionStatus = "DRAFT" | "PENDING_REVIEW" | "PENDING_BUDGET" | "PENDING_APPROVAL" | "APPROVED" | "SOURCING" | "ORDERED" | "REJECTED" | "CANCELLED";
export type BudgetGateStatus = "NOT_CHECKED" | "WITHIN" | "SOFT_BLOCK" | "HARD_BLOCK" | "OVERRIDDEN";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
export type DecisionStatus = "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
export type DoaMode = "SEQUENTIAL" | "PARALLEL" | "ANY";

export interface ItemOpt { id: string; code: string; name: string; unit: string; expenseCode: string }

export interface LineRow {
  id?: string; stockItemId: string | null; description: string; uom: string; quantity: string; estUnitPrice: string; lineTotal?: string; expenseCode: string; specification: string | null;
}

export interface Decision { id: string; step: number; roleKey: string; status: DecisionStatus; userName: string | null; note: string | null; decidedAt: string | null }
export interface ApprovalRequest {
  id: string; subjectType: string; subjectId: string; subjectRef: string; amount: string; currency: string; amountBase: string; baseCurrency: string;
  rate: string | null; tierName: string; status: ApprovalStatus; reason: string | null; createdAt: string; resolvedAt: string | null;
  decisions: Decision[]; tier: { mode: DoaMode; minSignatures: number } | null;
}

export interface RequisitionRow {
  id: string; prNumber: string; title: string; department: string | null; costCenter: string | null; neededBy: string | null;
  currency: string; subtotal: string; amountBase: string | null; baseCurrency: string | null; status: RequisitionStatus;
  budgetStatus: BudgetGateStatus; createdAt: string; version: number; _count?: { lines: number };
}

export interface RequisitionDetail extends RequisitionRow {
  justification: string | null; submittedAt: string | null; reviewedAt: string | null; reviewNote: string | null;
  budgetNote: string | null; budgetOverrideAt: string | null; budgetOverrideNote: string | null;
  approvedAt: string | null; rejectedReason: string | null;
  lines: (LineRow & { id: string; lineTotal: string })[];
  approvals: ApprovalRequest[];
}

export interface Tier {
  id: string; name: string; minAmount: string; maxAmount: string | null; currency: string; approverRoles: string[]; mode: DoaMode;
  minSignatures: number; requiresBudgetSignOff: boolean; requiresBidSummary: boolean; autoRelease: boolean; sortOrder: number; isActive: boolean; version: number;
}
export interface Policy {
  id: string; version: number; minQuotes: number; priceTolerancePct: string; quantityTolerancePct: string; overDeliveryTolerancePct: string;
  retriggerVariancePct: string; retriggerVarianceAmount: string; poTurnaroundSlaDays: number; shippingDocsBeforeGrn: boolean; thresholdCurrency: string;
}
export interface DoaSettings {
  tiers: Tier[]; roles: { key: string; name: string | null; exists: boolean; holders: number | null }[]; problems: string[];
  availableRoles: { key: string; name: string }[]; policy: Policy;
}

export const STATUS_LABEL: Record<RequisitionStatus, string> = {
  DRAFT: "Draft", PENDING_REVIEW: "Technical review", PENDING_BUDGET: "Pending budget", PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved", SOURCING: "Sourcing", ORDERED: "Ordered", REJECTED: "Rejected", CANCELLED: "Cancelled",
};
export const STATUS_VARIANT: Record<RequisitionStatus, "secondary" | "info" | "warning" | "success" | "destructive" | "default"> = {
  DRAFT: "secondary", PENDING_REVIEW: "info", PENDING_BUDGET: "warning", PENDING_APPROVAL: "info", APPROVED: "success",
  SOURCING: "info", ORDERED: "success", REJECTED: "destructive", CANCELLED: "secondary",
};
export const BUDGET_LABEL: Record<BudgetGateStatus, string> = {
  NOT_CHECKED: "Not checked", WITHIN: "Within budget", SOFT_BLOCK: "Over budget (warning)", HARD_BLOCK: "Over budget (blocked)", OVERRIDDEN: "Overridden by Finance",
};
export const DECISION_VARIANT: Record<DecisionStatus, "secondary" | "success" | "destructive" | "info"> = { PENDING: "info", APPROVED: "success", REJECTED: "destructive", SKIPPED: "secondary" };
export const MODE_LABEL: Record<DoaMode, string> = { SEQUENTIAL: "Sequential (in order)", PARALLEL: "Parallel (all listed)", ANY: "Any one of" };

export const money = (v: string | number, ccy: string) => `${ccy} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "");
