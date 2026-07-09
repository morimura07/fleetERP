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
  PaymentMethod,
  CustomerAccountGroup,
  PartyStatus,
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
  EmployeeStatus,
  PayRunStatus,
  ExpenseClaimStatus,
  AssetCategory,
  AssetStatus,
  ServiceOrderStatus,
  ServiceKind,
  EmploymentType,
  ContractStatus,
  LeaveType,
  LeaveStatus,
  EmployeeDocType,
  AttendanceSource,
  TimesheetStatus,
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
  CARRIER: "Carrier (FTL/LTL)",
  FREIGHT_BROKER: "Freight Broker",
  OWNER_OPERATOR: "Owner-Operator",
  WORKSHOP: "Workshop / Garage",
  OTHER: "Other",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  EFT: "EFT",
  WIRE: "Wire Transfer",
  CHEQUE: "Cheque",
  CASH: "Cash",
  MOBILE_MONEY: "Mobile Money",
  FUEL_CARD: "Fuel Card",
};

export const CUSTOMER_ACCOUNT_GROUP_LABEL: Record<CustomerAccountGroup, string> = {
  SOLD_TO: "Sold-to",
  SHIP_TO: "Ship-to",
  BILL_TO: "Bill-to",
  PAYER: "Payer",
};

export const PARTY_STATUS_LABEL: Record<PartyStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ON_HOLD: "On Hold",
  PROSPECT: "Prospect",
  SUSPENDED: "Suspended",
};

export const PARTY_STATUS_VARIANT: Record<PartyStatus, BadgeVariant> = {
  ACTIVE: "success",
  INACTIVE: "secondary",
  ON_HOLD: "warning",
  PROSPECT: "info",
  SUSPENDED: "destructive",
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

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On Leave",
  TERMINATED: "Terminated",
};

export const EMPLOYEE_STATUS_VARIANT: Record<EmployeeStatus, BadgeVariant> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  TERMINATED: "secondary",
};

export const PAYRUN_STATUS_LABEL: Record<PayRunStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  POSTED: "Posted",
};

export const PAYRUN_STATUS_VARIANT: Record<PayRunStatus, BadgeVariant> = {
  DRAFT: "secondary",
  APPROVED: "info",
  POSTED: "success",
};

export const EXPENSE_STATUS_LABEL: Record<ExpenseClaimStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  POSTED: "Posted",
  REJECTED: "Rejected",
};

export const EXPENSE_STATUS_VARIANT: Record<ExpenseClaimStatus, BadgeVariant> = {
  DRAFT: "secondary",
  SUBMITTED: "info",
  APPROVED: "warning",
  POSTED: "success",
  REJECTED: "destructive",
};

export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  VEHICLE: "Vehicle",
  EQUIPMENT: "Equipment",
  FURNITURE: "Furniture & Fixtures",
  BUILDING: "Building",
  IT: "IT & Computers",
  OTHER: "Other",
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  ACTIVE: "Active",
  FULLY_DEPRECIATED: "Fully depreciated",
  DISPOSED: "Disposed",
};

export const ASSET_STATUS_VARIANT: Record<AssetStatus, BadgeVariant> = {
  ACTIVE: "success",
  FULLY_DEPRECIATED: "info",
  DISPOSED: "secondary",
};

export const SERVICE_STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  POSTED: "Posted",
  CANCELLED: "Cancelled",
};

export const SERVICE_STATUS_VARIANT: Record<ServiceOrderStatus, BadgeVariant> = {
  OPEN: "secondary",
  IN_PROGRESS: "info",
  COMPLETED: "warning",
  POSTED: "success",
  CANCELLED: "destructive",
};

export const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  INTERNAL: "Own workshop",
  EXTERNAL: "External garage",
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  PERMANENT: "Permanent",
  FIXED_TERM: "Fixed term",
  PROBATION: "Probation",
  CONTRACTOR: "Contractor",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ENDED: "Ended",
};

export const CONTRACT_STATUS_VARIANT: Record<ContractStatus, BadgeVariant> = {
  DRAFT: "secondary",
  ACTIVE: "success",
  ENDED: "secondary",
};

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "Annual",
  SICK: "Sick",
  UNPAID: "Unpaid",
  MATERNITY: "Maternity",
  COMPASSIONATE: "Compassionate",
};

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const LEAVE_STATUS_VARIANT: Record<LeaveStatus, BadgeVariant> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "secondary",
};

export const EMPLOYEE_DOC_LABEL: Record<EmployeeDocType, string> = {
  CONTRACT: "Contract",
  NATIONAL_ID: "National ID",
  PASSPORT: "Passport",
  WORK_PERMIT: "Work permit",
  CERTIFICATE: "Certificate",
  OTHER: "Other",
};

export const ATTENDANCE_SOURCE_LABEL: Record<AttendanceSource, string> = {
  MANUAL: "Manual",
  MOBILE: "Mobile app",
  BIOMETRIC: "Biometric",
};

export const TIMESHEET_STATUS_LABEL: Record<TimesheetStatus, string> = {
  OPEN: "Open",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const TIMESHEET_STATUS_VARIANT: Record<TimesheetStatus, BadgeVariant> = {
  OPEN: "secondary",
  SUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "destructive",
};
