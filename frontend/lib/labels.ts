import type {
  JobStatus,
  DriverStatus,
  DriverType,
  OwnershipStatus,
  FuelType,
  FacilityType,
  VehicleStatus,
  Role,
  ContractType,
  AccountType,
  AccountSubType,
  PostingType,
  JournalDocType,
  JournalStatus,
  OrderStatus,
  TripStatus,
  CorridorType,
  EquipmentType,
  TripExpenseType,
  InvoiceStatus,
  PaymentTerm,
  VendorGroup,
  PaymentMethod,
  CustomerAccountGroup,
  PartyStatus,
  DunningLevel,
  DisputeStatus,
  CollectionActivityType,
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
  DockEventKind,
  DamageStatus,
  LeadStage,
  QuoteStatus,
  ProjectStatus,
  ForecastStatus,
  PosSaleStatus,
  PosPaymentMethod,
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

export const DRIVER_TYPE_LABEL: Record<DriverType, string> = {
  COMPANY: "Company Driver",
  OWNER_OPERATOR: "Owner-Operator",
  SUBCONTRACTOR: "Subcontractor",
};

export const OWNERSHIP_STATUS_LABEL: Record<OwnershipStatus, string> = {
  OWNED: "Owned",
  LEASED: "Leased",
  SUBCONTRACTED: "Subcontracted",
};

export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  DIESEL: "Diesel",
  PETROL: "Petrol",
  ELECTRIC: "Electric",
  HYBRID: "Hybrid",
  CNG: "CNG",
  OTHER: "Other",
};

export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = {
  DISTRIBUTION_CENTER: "Distribution Center",
  CROSS_DOCK: "Cross-Dock",
  TRANSIT_HUB: "Transit Hub",
  BONDED_WAREHOUSE: "Bonded Warehouse",
  YARD: "Yard",
  OTHER: "Other",
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

export const ACCOUNT_SUBTYPE_LABEL: Record<AccountSubType, string> = {
  CURRENT_ASSET: "Current Asset",
  FIXED_ASSET: "Fixed Asset",
  CURRENT_LIABILITY: "Current Liability",
  LONG_TERM_LIABILITY: "Long-term Liability",
  EQUITY: "Equity",
  OPERATING_REVENUE: "Operating Revenue",
  OTHER_REVENUE: "Other Revenue",
  COST_OF_SALES: "Cost of Sales (Direct)",
  OPERATING_EXPENSE: "Operating Expense",
  OTHER_EXPENSE: "Other Expense",
  NONE: "— None —",
};

export const POSTING_TYPE_LABEL: Record<PostingType, string> = {
  POSTABLE: "Postable",
  HEADER: "Header (roll-up)",
  CONTROL: "Control (sub-ledger)",
};

export const JOURNAL_DOC_TYPE_LABEL: Record<JournalDocType, string> = {
  GENERAL: "General",
  ACCRUAL: "Accrual",
  DEPRECIATION: "Depreciation",
  CASH_DISBURSEMENT: "Cash Disbursement",
  CASH_RECEIPT: "Cash Receipt",
  ADJUSTMENT: "Adjustment",
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

export const EQUIPMENT_TYPE_LABEL: Record<EquipmentType, string> = {
  FLATBED: "Flatbed",
  DRY_VAN: "Dry Van",
  REEFER: "Reefer (Refrigerated)",
  TANKER: "Tanker",
  CONTAINER_20FT: "20ft Container",
  CONTAINER_40FT: "40ft Container",
  CURTAIN_SIDE: "Curtain-side",
  LTL: "LTL (Less-than-truckload)",
  OTHER: "Other",
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

export const DUNNING_LEVEL_LABEL: Record<DunningLevel, string> = {
  NONE: "None",
  REMINDER: "Reminder",
  FIRST_NOTICE: "1st Notice",
  SECOND_NOTICE: "2nd Notice",
  FINAL_NOTICE: "Final Notice",
  LEGAL: "Legal",
};

export const DUNNING_LEVEL_VARIANT: Record<DunningLevel, BadgeVariant> = {
  NONE: "secondary",
  REMINDER: "info",
  FIRST_NOTICE: "warning",
  SECOND_NOTICE: "warning",
  FINAL_NOTICE: "destructive",
  LEGAL: "destructive",
};

export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  NONE: "—",
  OPEN: "Open",
  UNDER_INVESTIGATION: "Investigating",
  RESOLVED: "Resolved",
  WRITTEN_OFF: "Written off",
};

export const DISPUTE_STATUS_VARIANT: Record<DisputeStatus, BadgeVariant> = {
  NONE: "secondary",
  OPEN: "warning",
  UNDER_INVESTIGATION: "info",
  RESOLVED: "success",
  WRITTEN_OFF: "destructive",
};

export const COLLECTION_ACTIVITY_LABEL: Record<CollectionActivityType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  LETTER: "Letter",
  DUNNING: "Dunning",
  PROMISE_TO_PAY: "Promise to Pay",
  DISPUTE: "Dispute",
  NOTE: "Note",
  WRITE_OFF: "Write-off",
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

export const DOCK_EVENT_KIND_LABEL: Record<DockEventKind, string> = {
  ARRIVAL: "Arrival",
  DEPARTURE: "Departure",
};

export const DAMAGE_STATUS_LABEL: Record<DamageStatus, string> = {
  REPORTED: "Reported",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SETTLED: "Settled",
};

export const DAMAGE_STATUS_VARIANT: Record<DamageStatus, BadgeVariant> = {
  REPORTED: "secondary",
  UNDER_REVIEW: "info",
  APPROVED: "success",
  REJECTED: "destructive",
  SETTLED: "success",
};

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  WON: "Won",
  LOST: "Lost",
};

export const LEAD_STAGE_VARIANT: Record<LeadStage, BadgeVariant> = {
  NEW: "secondary",
  CONTACTED: "info",
  QUALIFIED: "warning",
  WON: "success",
  LOST: "destructive",
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CONVERTED: "Converted",
};

export const QUOTE_STATUS_VARIANT: Record<QuoteStatus, BadgeVariant> = {
  DRAFT: "secondary",
  SENT: "info",
  ACCEPTED: "success",
  REJECTED: "destructive",
  EXPIRED: "warning",
  CONVERTED: "default",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const PROJECT_STATUS_VARIANT: Record<ProjectStatus, BadgeVariant> = {
  PLANNING: "secondary",
  ACTIVE: "info",
  ON_HOLD: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export const FORECAST_STATUS_LABEL: Record<ForecastStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  ARCHIVED: "Archived",
};

export const FORECAST_STATUS_VARIANT: Record<ForecastStatus, BadgeVariant> = {
  DRAFT: "secondary",
  CONFIRMED: "success",
  ARCHIVED: "default",
};

export const POS_STATUS_LABEL: Record<PosSaleStatus, string> = {
  DRAFT: "Draft",
  COMPLETED: "Completed",
  VOID: "Void",
};

export const POS_STATUS_VARIANT: Record<PosSaleStatus, BadgeVariant> = {
  DRAFT: "secondary",
  COMPLETED: "success",
  VOID: "destructive",
};

export const POS_PAYMENT_LABEL: Record<PosPaymentMethod, string> = {
  CASH: "Cash",
  MOBILE_MONEY: "Mobile money",
  CARD: "Card",
};

// ── Fixed-choice option lists for fields the client spec enumerates but the
// backend stores as free strings (so they need dropdowns, not enum columns). ──
export const INCOTERMS_OPTIONS = ["EXW", "FOB", "CIF", "CFR", "DAP", "DDP", "FCA", "CPT"] as const;
export const VALUATION_METHOD_OPTIONS = ["AVERAGE", "FIFO", "LIFO"] as const;
export const PART_CONDITION_OPTIONS = ["New", "Rebuilt", "Remanufactured", "Used"] as const;
export const DOCK_SCHEDULING_OPTIONS = ["Appointment", "Open-arrival"] as const;
export const PUTAWAY_STRATEGY_OPTIONS = ["Fixed bin", "Empty bin", "Closest to dock"] as const;
export const PICKING_STRATEGY_OPTIONS = ["FIFO", "LIFO", "Partial pallet"] as const;
export const COUNT_METHOD_OPTIONS = ["Annual", "Cycle counting", "Continuous"] as const;
export const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;
export const PAY_FREQUENCY_OPTIONS = ["Weekly", "Bi-weekly", "Monthly"] as const;
export const EMPLOYMENT_TYPE_OPTIONS = ["Full-time", "Part-time", "Contract", "Agency"] as const;
