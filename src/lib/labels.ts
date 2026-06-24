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
} from "@prisma/client";

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
