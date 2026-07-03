import type {
  JobStatus,
  DriverStatus,
  VehicleStatus,
  Role,
  ContractType,
  AccountType,
  JournalStatus,
  OrderStatus,
  TripStatus,
  CorridorType,
  TripExpenseType,
  InvoiceStatus,
  PaymentTerm,
  VendorGroup,
  RateType,
  BankAccountType,
  DisbursementType,
  TransferStatus,
  BudgetKind,
  BudgetControl,
  DriverDocType,
  ReconStatus,
  StockCategory,
  StockUnit,
  PurchaseOrderStatus,
  MatchStatus,
} from "@frontend/lib/enums";

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "info" | "destructive";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  PENDING: "Pending",
  WAITING_DISPATCH: "Awaiting Dispatch",
  ASSIGNED: "Assigned",
  DELIVERING: "Delivering",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const JOB_STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  PENDING: "secondary",
  WAITING_DISPATCH: "warning",
  ASSIGNED: "info",
  DELIVERING: "default",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  ACTIVE: "Active",
  VACATION: "On Leave",
  INACTIVE: "Inactive",
};

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  AVAILABLE: "Available",
  MAINTENANCE: "In Maintenance",
  UNAVAILABLE: "Unavailable",
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  DISPATCHER: "Operations Planner",
  FINANCE: "Finance Controller",
  DRIVER: "Driver",
  STAFF: "Staff",
};

export const CONTRACT_LABEL: Record<ContractType, string> = {
  EMPLOYEE: "Employee",
  CONTRACTOR: "Contractor",
  PARTTIME: "Part-time",
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ───────── Accounting ─────────
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
};

export const JOURNAL_STATUS_LABEL: Record<JournalStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  REVERSED: "Reversed",
};

export const JOURNAL_STATUS_VARIANT: Record<JournalStatus, BadgeVariant> = {
  DRAFT: "secondary",
  POSTED: "success",
  REVERSED: "destructive",
};

// ───────── Freight (Orders & Trips) ─────────
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Quote",
  CONFIRMED: "Confirmed",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  INVOICED: "Invoiced",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = {
  DRAFT: "secondary",
  CONFIRMED: "info",
  IN_TRANSIT: "default",
  DELIVERED: "warning",
  INVOICED: "success",
  CANCELLED: "destructive",
};

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  PLANNED: "Planned",
  DISPATCHED: "Dispatched",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const TRIP_STATUS_VARIANT: Record<TripStatus, BadgeVariant> = {
  PLANNED: "secondary",
  DISPATCHED: "info",
  IN_PROGRESS: "default",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export const CORRIDOR_LABEL: Record<CorridorType, string> = {
  NORTHERN: "Northern Corridor",
  CENTRAL: "Central Corridor",
  DOMESTIC: "Domestic",
};

export const TRIP_EXPENSE_LABEL: Record<TripExpenseType, string> = {
  FUEL: "Fuel",
  TOLLS: "Tolls",
  BORDER_FEES: "Border Fees",
  DRIVER_ALLOWANCE: "Driver Allowance",
  DEMURRAGE: "Demurrage",
  MAINTENANCE: "Maintenance",
  OTHER: "Other",
};

// ───────── AP / AR ─────────
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  DRAFT: "secondary",
  POSTED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "destructive",
};

export const PAYMENT_TERM_LABEL: Record<PaymentTerm, string> = {
  NET_30: "Net 30",
  NET_60: "Net 60",
  COD: "Cash on Delivery",
};

export const VENDOR_GROUP_LABEL: Record<VendorGroup, string> = {
  FUEL_SUPPLIER: "Fuel Supplier",
  SPARE_PARTS: "Spare Parts",
  CLEARING_AGENT: "Clearing Agent",
  SUBCONTRACTED_FLEET: "Subcontracted Fleet",
  STATUTORY: "Statutory",
  OTHER: "Other",
};

// ───────── Phase 2: Core Finance ─────────
export const RATE_TYPE_LABEL: Record<RateType, string> = {
  SPOT: "Spot",
  AVERAGE: "Average",
  HISTORICAL: "Historical",
};

export const BANK_ACCOUNT_TYPE_LABEL: Record<BankAccountType, string> = {
  BANK: "Bank",
  MOBILE_MONEY: "Mobile Money",
  CASH: "Cash",
};

export const DISBURSEMENT_TYPE_LABEL: Record<DisbursementType, string> = {
  FUEL_ALLOWANCE: "Fuel Allowance",
  TOLLS: "Tolls",
  BORDER_FEES: "Border Fees",
  EMERGENCY_REPAIR: "Emergency Repair",
  DRIVER_ADVANCE: "Driver Advance",
  OTHER: "Other",
};

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  PENDING: "Pending",
  SUCCESS: "Success",
  FAILED: "Failed",
  TIMEOUT: "Timeout",
};

export const TRANSFER_STATUS_VARIANT: Record<TransferStatus, BadgeVariant> = {
  PENDING: "warning",
  SUCCESS: "success",
  FAILED: "destructive",
  TIMEOUT: "destructive",
};

export const BUDGET_KIND_LABEL: Record<BudgetKind, string> = {
  CAPEX: "CapEx",
  OPEX: "OpEx",
};

export const BUDGET_CONTROL_LABEL: Record<BudgetControl, string> = {
  STRICT_BLOCK: "Strict Block",
  WARNING_ONLY: "Warning Only",
  OVERRIDE: "Director Override",
};

// ───────── Phase 3: Operations ─────────
export const DRIVER_DOC_LABEL: Record<DriverDocType, string> = {
  LICENSE: "Driving Licence",
  PASSPORT: "Passport",
  COMESA_PERMIT: "COMESA Permit",
  YELLOW_FEVER: "Yellow Fever Cert",
  WORK_PERMIT: "Work Permit",
  OTHER: "Other",
};

export const RECON_STATUS_LABEL: Record<ReconStatus, string> = {
  UNRECONCILED: "Unreconciled",
  MATCHED: "Matched",
  DISCREPANCY: "Discrepancy",
};

export const RECON_STATUS_VARIANT: Record<ReconStatus, BadgeVariant> = {
  UNRECONCILED: "secondary",
  MATCHED: "success",
  DISCREPANCY: "destructive",
};

// Document lifecycle bucket (compliance dashboard) — string keys, not a Prisma enum.
export const DOC_BUCKET_LABEL: Record<string, string> = {
  CURRENT: "Current",
  EXPIRING_SOON: "Expiring Soon",
  EXPIRED: "Expired",
  MISSING: "Missing",
};

export const DOC_BUCKET_VARIANT: Record<string, BadgeVariant> = {
  CURRENT: "success",
  EXPIRING_SOON: "warning",
  EXPIRED: "destructive",
  MISSING: "secondary",
};

// Fuel-efficiency status.
export const FUEL_STATUS_LABEL: Record<string, string> = {
  MEETS_TARGET: "Meets Target",
  BELOW_EXPECTED: "Below Expected",
  NO_DATA: "No Data",
};

export const FUEL_STATUS_VARIANT: Record<string, BadgeVariant> = {
  MEETS_TARGET: "success",
  BELOW_EXPECTED: "destructive",
  NO_DATA: "secondary",
};

export const STOCK_CATEGORY_LABEL: Record<StockCategory, string> = {
  SPARE_PART: "Spare Part",
  FUEL: "Fuel",
  TYRE: "Tyre",
  LUBRICANT: "Lubricant",
  CONSUMABLE: "Consumable",
  OTHER: "Other",
};

export const STOCK_UNIT_LABEL: Record<StockUnit, string> = {
  PIECE: "pc",
  LITRE: "L",
  KG: "kg",
  SET: "set",
  METRE: "m",
  BOX: "box",
};

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  PARTIAL: "Partially Received",
  RECEIVED: "Received",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export const PO_STATUS_VARIANT: Record<PurchaseOrderStatus, BadgeVariant> = {
  DRAFT: "secondary",
  APPROVED: "info",
  PARTIAL: "warning",
  RECEIVED: "success",
  CLOSED: "default",
  CANCELLED: "destructive",
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  UNMATCHED: "Unmatched",
  MATCHED: "Matched",
  VARIANCE: "Variance",
};

export const MATCH_STATUS_VARIANT: Record<MatchStatus, BadgeVariant> = {
  UNMATCHED: "secondary",
  MATCHED: "success",
  VARIANCE: "destructive",
};
