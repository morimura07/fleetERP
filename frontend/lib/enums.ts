/**
 * Domain enums — frontend copy.
 *
 * Mirrors the enums in the backend's Prisma schema so the web app needs no
 * Prisma (or database) dependency. These are stable domain vocabulary; keep in
 * sync with backend/prisma/schema.prisma.
 */

export type Role = "ADMIN" | "DISPATCHER" | "FINANCE" | "DRIVER" | "STAFF";
export type DriverStatus = "ACTIVE" | "VACATION" | "INACTIVE";
export type ContractType = "EMPLOYEE" | "CONTRACTOR" | "PARTTIME";
export type VehicleStatus = "AVAILABLE" | "MAINTENANCE" | "UNAVAILABLE";
export type JobStatus =
  | "PENDING"
  | "WAITING_DISPATCH"
  | "ASSIGNED"
  | "DELIVERING"
  | "COMPLETED"
  | "CANCELLED";
export type DispatchStatus = "SCHEDULED" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type NotificationType = "DISPATCH" | "JOB_UPDATE" | "COMPLETION" | "SYSTEM";
export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
export type JournalStatus = "DRAFT" | "POSTED" | "REVERSED";
export type OrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "INVOICED"
  | "CANCELLED";
export type TripStatus = "PLANNED" | "DISPATCHED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type CorridorType = "NORTHERN" | "CENTRAL" | "DOMESTIC";
export type TripExpenseType =
  | "FUEL"
  | "TOLLS"
  | "BORDER_FEES"
  | "DRIVER_ALLOWANCE"
  | "DEMURRAGE"
  | "MAINTENANCE"
  | "OTHER";
export type PaymentTerm = "NET_30" | "NET_60" | "COD";
export type VendorGroup =
  | "FUEL_SUPPLIER"
  | "SPARE_PARTS"
  | "CLEARING_AGENT"
  | "SUBCONTRACTED_FLEET"
  | "STATUTORY"
  | "CARRIER"
  | "FREIGHT_BROKER"
  | "OWNER_OPERATOR"
  | "WORKSHOP"
  | "OTHER";
export type PaymentMethod = "EFT" | "WIRE" | "CHEQUE" | "CASH" | "MOBILE_MONEY" | "FUEL_CARD";
export type CustomerAccountGroup = "SOLD_TO" | "SHIP_TO" | "BILL_TO" | "PAYER";
export type PartyStatus = "ACTIVE" | "INACTIVE" | "ON_HOLD" | "PROSPECT" | "SUSPENDED";
export type InvoiceStatus = "DRAFT" | "POSTED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
export type RateType = "SPOT" | "AVERAGE" | "HISTORICAL";
export type BankAccountType = "BANK" | "MOBILE_MONEY" | "CASH";
export type DisbursementType =
  | "FUEL_ALLOWANCE"
  | "TOLLS"
  | "BORDER_FEES"
  | "EMERGENCY_REPAIR"
  | "DRIVER_ADVANCE"
  | "OTHER";
export type TransferStatus = "PENDING" | "SUCCESS" | "FAILED" | "TIMEOUT";
export type BudgetKind = "CAPEX" | "OPEX";
export type BudgetControl = "STRICT_BLOCK" | "WARNING_ONLY" | "OVERRIDE";
export type DriverDocType =
  | "LICENSE"
  | "PASSPORT"
  | "COMESA_PERMIT"
  | "YELLOW_FEVER"
  | "WORK_PERMIT"
  | "OTHER";
export type ReconStatus = "UNRECONCILED" | "MATCHED" | "DISCREPANCY";
export type PositionSource = "STUB" | "GPS" | "MANUAL";
export type StockCategory = "SPARE_PART" | "FUEL" | "TYRE" | "LUBRICANT" | "CONSUMABLE" | "OTHER";
export type StockUnit = "PIECE" | "LITRE" | "KG" | "SET" | "METRE" | "BOX";
export type StockMovementType = "RECEIPT" | "ISSUE" | "ADJUSTMENT";
export type PurchaseOrderStatus = "DRAFT" | "APPROVED" | "PARTIAL" | "RECEIVED" | "CLOSED" | "CANCELLED";
export type MatchStatus = "UNMATCHED" | "MATCHED" | "VARIANCE";
export type EmployeeStatus = "ACTIVE" | "ON_LEAVE" | "TERMINATED";
export type PayRunStatus = "DRAFT" | "APPROVED" | "POSTED";
export type ExpenseClaimStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REJECTED";
export type AssetCategory = "VEHICLE" | "EQUIPMENT" | "FURNITURE" | "BUILDING" | "IT" | "OTHER";
export type AssetStatus = "ACTIVE" | "FULLY_DEPRECIATED" | "DISPOSED";
export type ServiceOrderStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "POSTED" | "CANCELLED";
export type ServiceKind = "INTERNAL" | "EXTERNAL";
export type EmploymentType = "PERMANENT" | "FIXED_TERM" | "PROBATION" | "CONTRACTOR";
export type ContractStatus = "DRAFT" | "ACTIVE" | "ENDED";
export type LeaveType = "ANNUAL" | "SICK" | "UNPAID" | "MATERNITY" | "COMPASSIONATE";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type EmployeeDocType = "CONTRACT" | "NATIONAL_ID" | "PASSPORT" | "WORK_PERMIT" | "CERTIFICATE" | "OTHER";
export type AttendanceSource = "MANUAL" | "MOBILE" | "BIOMETRIC";
export type TimesheetStatus = "OPEN" | "SUBMITTED" | "APPROVED" | "REJECTED";
