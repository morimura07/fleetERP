import type {
  JobStatus, DriverStatus, DriverType, OwnershipStatus, FuelType, FacilityType, VehicleStatus, Role, ContractType, AccountType, AccountSubType, PostingType, JournalDocType, JournalStatus, OrderStatus, TripStatus, CorridorType, EquipmentType, TripExpenseType, InvoiceStatus, PaymentTerm, VendorGroup, PaymentMethod, CustomerAccountGroup, PartyStatus, DunningLevel, DisputeStatus, CollectionActivityType, RateType, BankAccountType, DisbursementType, TransferStatus, BudgetKind, BudgetControl, DriverDocType, ReconStatus, StockCategory, StockUnit, PurchaseOrderStatus, MatchStatus, EmployeeStatus, PayRunStatus, ExpenseClaimStatus, AssetCategory, AssetStatus, ServiceOrderStatus, ServiceKind, EmploymentType, ContractStatus, LeaveType, LeaveStatus, EmployeeDocType, AttendanceSource, TimesheetStatus, DockEventKind, DamageStatus, LeadStage, QuoteStatus, ProjectStatus, ForecastStatus, PosSaleStatus, PosPaymentMethod, PeriodStatus, AttributeDataType, UomDimension, IncidentType, IncidentCause, ClaimStatus, DockActivity, DockSource, CompanyKind, ShiftActivityKind, DutyStatus, FatigueStatus,} from "@frontend/lib/enums";

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
  SUPER_ADMIN: "Platform Administrator",
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
  RFID: "RFID badge",
  EVV: "Visit verification",
};

export const SHIFT_ACTIVITY_LABEL: Record<ShiftActivityKind, string> = {
  DRIVING: "Driving",
  LOADING: "Loading",
  UNLOADING: "Unloading",
  REFUELING: "Refuelling",
  BORDER_CROSSING: "Border crossing",
  INSPECTION: "Inspection",
  WAITING: "Waiting / delay",
  BREAK: "Break",
  REST: "Rest / sleeper",
  YARD_MOVE: "Yard move",
  OTHER: "Other",
};

export const DUTY_STATUS_LABEL: Record<DutyStatus, string> = {
  ON_DUTY_DRIVING: "On duty, driving",
  ON_DUTY_NOT_DRIVING: "On duty",
  OFF_DUTY: "Off duty",
  SLEEPER_BERTH: "Sleeper berth",
  YARD_MOVES: "Yard moves",
  CLOCKED_OUT: "Clocked out",
};

export const DUTY_STATUS_VARIANT: Record<DutyStatus, BadgeVariant> = {
  ON_DUTY_DRIVING: "success",
  ON_DUTY_NOT_DRIVING: "info",
  OFF_DUTY: "secondary",
  SLEEPER_BERTH: "secondary",
  YARD_MOVES: "info",
  CLOCKED_OUT: "secondary",
};

export const FATIGUE_STATUS_LABEL: Record<FatigueStatus, string> = {
  OK: "Within limits",
  WARNING: "Approaching a limit",
  EXCEEDED: "Limit reached",
  OFF_SHIFT: "Off shift",
};

export const FATIGUE_STATUS_VARIANT: Record<FatigueStatus, BadgeVariant> = {
  OK: "success",
  WARNING: "warning",
  EXCEEDED: "destructive",
  OFF_SHIFT: "secondary",
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

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  OPEN: "Open",
  CLOSED: "Closed",
};

export const PERIOD_STATUS_VARIANT: Record<PeriodStatus, BadgeVariant> = {
  OPEN: "success",
  CLOSED: "secondary",
};

export const ATTRIBUTE_TYPE_LABEL: Record<AttributeDataType, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  BOOLEAN: "Yes / No",
  LIST: "List (choice)",
};

export const UOM_DIMENSION_LABEL: Record<UomDimension, string> = {
  WEIGHT: "Weight",
  VOLUME: "Volume",
  LENGTH: "Distance / Length",
  AREA: "Area",
  COUNT: "Count",
  TIME: "Time",
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

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  TRANSIT_DAMAGE: "Transit Damage",
  MOISTURE_DAMAGE: "Wet / Moisture Damage",
  SHORTAGE_THEFT: "Shortage / Theft",
  CONTAMINATION_SPILLAGE: "Contamination / Spillage",
  ROAD_ACCIDENT: "Road Accident",
  OTHER: "Other",
};

export const INCIDENT_CAUSE_LABEL: Record<IncidentCause, string> = {
  DRIVER_NEGLIGENCE: "Driver Negligence",
  POOR_PACKAGING: "Poor Packaging",
  MECHANICAL_FAILURE: "Mechanical / Chiller Failure",
  THIRD_PARTY: "Third-Party Accident",
  FORCE_MAJEURE: "Force Majeure",
  UNDETERMINED: "Undetermined",
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  NOT_FILED: "Not Filed",
  LODGED: "Claim Lodged",
  UNDER_ASSESSMENT: "Under Assessment",
  APPROVED: "Approved",
  RECOVERED: "Recovered",
  REJECTED: "Rejected",
};

export const CLAIM_STATUS_VARIANT: Record<ClaimStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "info"> = {
  NOT_FILED: "secondary",
  LODGED: "info",
  UNDER_ASSESSMENT: "warning",
  APPROVED: "info",
  RECOVERED: "success",
  REJECTED: "destructive",
};

export const DOCK_ACTIVITY_LABEL: Record<DockActivity, string> = {
  LOADING: "Loading",
  OFFLOADING: "Offloading",
  CUSTOMS_INSPECTION: "Customs Inspection",
  CROSS_DOCKING: "Cross-Docking",
  OVERNIGHT_STAGING: "Overnight Staging",
  OTHER: "Other",
};

export const DOCK_SOURCE_LABEL: Record<DockSource, string> = {
  MANUAL: "Manual Entry",
  GEOFENCE: "Geofence Auto-Trigger",
  GATE_SCANNER: "RFID / ANPR Gate",
  MOBILE_APP: "Mobile Driver App",
};

export const COMPANY_KIND_LABEL: Record<CompanyKind, string> = {
  OPERATING: "Operating Entity",
  CLIENT: "Client (Shipper / Consignee)",
  VENDOR: "Vendor (Broker / Sub-contractor)",
  PARTNER: "Partner (3PL / Branch)",
};
