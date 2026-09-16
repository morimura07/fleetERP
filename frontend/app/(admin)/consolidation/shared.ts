import type { RateType } from "@frontend/lib/enums";

/** Types shared by the consolidation screens, mirroring the API's shapes. */

export type ConsolidationStatus = "DRAFT" | "SIMULATED" | "POSTED";
export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export interface CompanyOpt { code: string; name: string; baseCurrency: string; country: string }
export interface AccountOpt { dataAreaId: string; code: string; name: string; type: AccountType }
export interface Available { parentArea: string; companies: CompanyOpt[]; accounts: AccountOpt[] }

export interface EntityRow {
  id: string; parentArea: string; subsidiary: string; sharePct: string; ctaAccount: string; isActive: boolean; version: number;
}

export interface MapRow {
  id: string; parentArea: string; subsidiary: string; subAccount: string; parentAccount: string;
  rateType: RateType | null; intercompany: boolean; icPartner: string | null; note: string | null; version: number;
  subAccountName: string | null; accountType: AccountType | null; parentAccountName: string | null;
}

export interface RunLine {
  id: string; subsidiary: string; subAccount: string; subAccountName: string; parentAccount: string; parentAccountName: string;
  accountType: AccountType; currency: string; rateType: RateType; rate: string | null;
  beginningLocal: string; debitLocal: string; creditLocal: string; endingLocal: string;
  beginningBase: string; activityBase: string; endingBase: string; eliminationBase: string; sharePct: string; consolidatedBase: string;
  intercompany: boolean; isCta: boolean;
}

export interface RunWarnings {
  unmapped: string[]; missingRates: string[]; icMismatchBase: string; notes: string[];
  rates?: Record<string, Record<string, string | null>>;
}

export interface RunRow {
  id: string; parentArea: string; baseCurrency: string; period: string; periodStart: string; periodEnd: string;
  subsidiaries: string[]; status: ConsolidationStatus; ranAt: string | null; postedAt: string | null; postingEntryId: string | null;
  warnings: RunWarnings | null; memo: string | null; version: number;
}

export interface RunDetail extends RunRow {
  lines: RunLine[];
  summary: {
    endingBase: string; eliminationBase: string; consolidatedBase: string; ctaBase: string; ctaActivityBase: string;
    byParentAccount: { parentAccount: string; parentAccountName: string; accountType: AccountType; consolidatedBase: string }[];
    byEntity: { subsidiary: string; currency: string; lines: number; endingBase: string; ctaBase: string; sharePct: string }[];
  };
}

export const STATUS_LABEL: Record<ConsolidationStatus, string> = { DRAFT: "Draft", SIMULATED: "Simulated", POSTED: "Posted / locked" };
export const STATUS_VARIANT: Record<ConsolidationStatus, "secondary" | "info" | "success"> = { DRAFT: "secondary", SIMULATED: "info", POSTED: "success" };
export const TYPE_LABEL: Record<AccountType, string> = { ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", INCOME: "Revenue", EXPENSE: "Expense" };

/** A signed balance for display: debits plain, credits in parentheses. */
export function amt(v: string | number, ccy?: string): string {
  const n = Number(v);
  const s = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const body = n < 0 ? `(${s})` : s;
  return ccy ? `${ccy} ${body}` : body;
}

export const thisMonth = () => new Date().toISOString().slice(0, 7);
