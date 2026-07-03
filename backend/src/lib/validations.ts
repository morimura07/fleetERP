import { z } from "zod";

// ───────── shared ─────────
export const idSchema = z.string().cuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

const phone = z.string().min(8).max(20);
const yen = z.coerce.number().int().min(0);

// ───────── Auth ─────────
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Must be at least 8 characters"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10),
    password: z.string().min(8, "Must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

// ───────── Driver ─────────
export const driverSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email(),
  phone,
  address: z.string().min(1).max(255),
  contractType: z.enum(["EMPLOYEE", "CONTRACTOR", "PARTTIME"]),
  joinedAt: z.coerce.date(),
  status: z.enum(["ACTIVE", "VACATION", "INACTIVE"]).default("ACTIVE"),
  // optional: create a linked login account
  createLogin: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const availabilitySchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm format"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm format"),
  isActive: z.boolean().default(true),
});

export const holidaySchema = z.object({
  date: z.coerce.date(),
  reason: z.string().max(255).optional(),
});

// ───────── Vehicle ─────────
export const vehicleSchema = z.object({
  vehicleNumber: z.string().min(1).max(50),
  plateNumber: z.string().min(1).max(50),
  maker: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  insuranceExpiry: z.coerce.date(),
  inspectionExpiry: z.coerce.date(),
  status: z.enum(["AVAILABLE", "MAINTENANCE", "UNAVAILABLE"]).default("AVAILABLE"),
  // M11 cross-border compliance (optional)
  comesaPermitExpiry: z.coerce.date().optional().nullable(),
  yellowCardExpiry: z.coerce.date().optional().nullable(),
  fuelTargetKmPerL: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "km/L must be a positive number")
    .optional()
    .nullable(),
});

// ───────── Phase 3: Driver compliance documents (M11) ─────────
export const driverDocumentSchema = z.object({
  type: z.enum(["LICENSE", "PASSPORT", "COMESA_PERMIT", "YELLOW_FEVER", "WORK_PERMIT", "OTHER"]),
  number: z.string().max(60).optional(),
  issuedAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date(),
  note: z.string().max(255).optional(),
});

// ───────── Phase 3: GPS waypoint (M30 Common) ─────────
const coord = (min: number, max: number) =>
  z.coerce.number().min(min).max(max);
export const waypointSchema = z.object({
  code: z.string().min(1, "Code is required").max(40).transform((s) => s.toUpperCase()),
  name: z.string().min(1, "Name is required").max(120),
  kind: z.enum(["CHECKPOINT", "BORDER", "WEIGHBRIDGE", "DEPOT"]).default("CHECKPOINT"),
  lat: coord(-90, 90),
  lng: coord(-180, 180),
  country: z.string().max(40).optional(),
  isActive: z.boolean().default(true),
});

// ───────── Phase 3: Trip freight-bill reconciliation (M12) ─────────
export const tripReconSchema = z.object({
  reconStatus: z.enum(["UNRECONCILED", "MATCHED", "DISCREPANCY"]),
  carrierInvoiceRef: z.string().max(80).optional(),
  fuelLitres: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Litres must be a positive number")
    .optional()
    .nullable(),
});

export const maintenanceSchema = z.object({
  maintenanceType: z.string().min(1).max(100),
  date: z.coerce.date(),
  cost: yen,
  note: z.string().max(500).optional(),
});

// ───────── Client ─────────
export const clientSchema = z.object({
  companyName: z.string().min(1).max(150),
  contactPerson: z.string().min(1).max(100),
  phone,
  address: z.string().min(1).max(255),
  email: z.string().email(),
});

// ───────── DeliveryJob ─────────
export const jobSchema = z.object({
  jobCode: z.string().min(1).max(50),
  clientId: idSchema,
  pickupAddress: z.string().min(1).max(255),
  deliveryAddress: z.string().min(1).max(255),
  deliveryDate: z.coerce.date(),
  cargoDescription: z.string().min(1).max(500),
  rewardAmount: yen,
  note: z.string().max(1000).optional(),
  status: z
    .enum([
      "PENDING",
      "WAITING_DISPATCH",
      "ASSIGNED",
      "DELIVERING",
      "COMPLETED",
      "CANCELLED",
    ])
    .default("PENDING"),
});

export const jobStatusSchema = z.object({
  status: z.enum([
    "PENDING",
    "WAITING_DISPATCH",
    "ASSIGNED",
    "DELIVERING",
    "COMPLETED",
    "CANCELLED",
  ]),
});

// ───────── Dispatch ─────────
export const dispatchSchema = z
  .object({
    jobId: idSchema,
    driverId: idSchema,
    vehicleId: idSchema,
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date(),
  })
  .refine((d) => d.scheduledEnd > d.scheduledStart, {
    message: "End time must be after start time",
    path: ["scheduledEnd"],
  });

// ───────── DailyReport ─────────
export const dailyReportSchema = z
  .object({
    jobId: idSchema,
    workStart: z.coerce.date(),
    workEnd: z.coerce.date(),
    mileage: z.coerce.number().int().min(0),
    note: z.string().max(1000).optional(),
    proofImageUrl: z.string().optional(),
  })
  .refine((d) => d.workEnd > d.workStart, {
    message: "End time must be after start time",
    path: ["workEnd"],
  });

// ───────── Accounting: Account (Account) ─────────
export const accountSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  code: z.string().min(1, "Account code is required").max(20),
  name: z.string().min(1, "Account name is required").max(100),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  parentId: idSchema.optional().nullable(),
  isActive: z.boolean().default(true),
});

// ───────── Accounting: Journal Entry (Journal Entry) ─────────
// Money as a decimal string to preserve precision end-to-end (no JS float).
const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive number with up to 2 decimals")
  .optional()
  .default("0");

export const journalLineSchema = z.object({
  accountId: idSchema,
  debit: money,
  credit: money,
  memo: z.string().max(255).optional(),
  dimension: z.string().max(100).optional(),
});

export const journalEntrySchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  postingDate: z.coerce.date(),
  currency: z.string().length(3, "Currency must be a 3-letter ISO 4217 code").default("USD"),
  exchangeRate: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, "Invalid exchange rate")
    .optional()
    .default("1"),
  memo: z.string().max(500).optional(),
  post: z.boolean().optional().default(false), // post immediately vs save as draft
  lines: z.array(journalLineSchema).min(2, "A journal entry needs at least 2 lines"),
});

// ───────── Freight: Order (Order) ─────────
const decimalAmount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive number with up to 2 decimals");

export const orderSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  clientId: idSchema,
  originZone: z.string().min(1, "Origin is required").max(120),
  destinationZone: z.string().min(1, "Destination is required").max(120),
  corridor: z.enum(["NORTHERN", "CENTRAL", "DOMESTIC"]).default("DOMESTIC"),
  cargoDescription: z.string().min(1).max(500),
  grossWeightKg: decimalAmount.optional().default("0"),
  volumeCbm: decimalAmount.optional().default("0"),
  freightAmount: decimalAmount,
  demurrageAmount: decimalAmount.optional().default("0"),
  currency: z.string().length(3).default("USD"),
  bookingDate: z.coerce.date(),
  status: z
    .enum(["DRAFT", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "INVOICED", "CANCELLED"])
    .default("DRAFT"),
});

// ───────── Freight: Trip (Trip) ─────────
// Base object kept separate so `.partial()` works for PATCH (a refined schema
// becomes a ZodEffects, which has no `.partial`).
export const tripBaseSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  orderId: idSchema,
  driverId: idSchema,
  vehicleId: idSchema,
  corridor: z.enum(["NORTHERN", "CENTRAL", "DOMESTIC"]).default("DOMESTIC"),
  mileageKm: decimalAmount.optional().default("0"),
  transitHours: decimalAmount.optional().default("0"),
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
  status: z
    .enum(["PLANNED", "DISPATCHED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    .default("PLANNED"),
});

export const tripSchema = tripBaseSchema.refine(
  (d) => d.scheduledEnd > d.scheduledStart,
  { message: "End time must be after start time", path: ["scheduledEnd"] },
);

export const tripExpenseSchema = z.object({
  type: z.enum([
    "FUEL",
    "TOLLS",
    "BORDER_FEES",
    "DRIVER_ALLOWANCE",
    "DEMURRAGE",
    "MAINTENANCE",
    "OTHER",
  ]),
  amount: decimalAmount,
  currency: z.string().length(3).default("USD"),
  note: z.string().max(255).optional(),
  post: z.boolean().optional().default(false), // post to ledger immediately
});

// ───────── AP: Vendor (M1) ─────────
const money0 = decimalAmount.optional().default("0");

export const vendorSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  code: z.string().min(1, "Vendor code is required").max(30),
  legalName: z.string().min(1, "Legal name is required").max(150),
  group: z
    .enum(["FUEL_SUPPLIER", "SPARE_PARTS", "CLEARING_AGENT", "SUBCONTRACTED_FLEET", "STATUTORY", "OTHER"])
    .default("OTHER"),
  tin: z.string().max(50).optional(),
  vrn: z.string().max(50).optional(),
  paymentTerm: z.enum(["NET_30", "NET_60", "COD"]).default("NET_30"),
  currency: z.string().length(3).default("USD"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
});

export const vendorInvoiceSchema = z.object({
  vendorId: idSchema,
  invoiceNumber: z.string().min(1, "Invoice number is required").max(60),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  currency: z.string().length(3).default("USD"),
  subtotal: decimalAmount,
  vatAmount: money0,
  whtAmount: money0,
  expenseCode: z.string().min(1).max(20).default("6100"),
  memo: z.string().max(255).optional(),
  post: z.boolean().optional().default(false),
});

export const vendorPaymentSchema = z.object({
  amount: decimalAmount,
  paidAt: z.coerce.date(),
  bankCode: z.string().min(1).max(20).default("1010"),
  reference: z.string().max(100).optional(),
});

// ───────── AR: Customer (M2) ─────────
export const customerSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  code: z.string().min(1, "Customer code is required").max(30),
  name: z.string().min(1, "Name is required").max(150),
  tin: z.string().max(50).optional(),
  creditLimit: money0,
  creditDays: z.coerce.number().int().min(0).max(365).default(30),
  taxExempt: z.boolean().default(false),
  currency: z.string().length(3).default("USD"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
});

export const customerInvoiceSchema = z.object({
  customerId: idSchema,
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  currency: z.string().length(3).default("USD"),
  subtotal: decimalAmount,
  vatAmount: money0,
  revenueCode: z.string().min(1).max(20).default("4000"),
  memo: z.string().max(255).optional(),
  post: z.boolean().optional().default(false),
});

export const customerReceiptSchema = z.object({
  amount: decimalAmount,
  receivedAt: z.coerce.date(),
  bankCode: z.string().min(1).max(20).default("1010"),
  reference: z.string().max(100).optional(),
});

// ───────── Phase 2: Exchange Rate (M8 multi-currency) ─────────
const rateValue = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Rate must be a positive number with up to 6 decimals");

export const exchangeRateSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  currency: z.string().length(3, "3-letter ISO 4217 code"),
  baseCurrency: z.string().length(3).default("USD"),
  rateType: z.enum(["SPOT", "AVERAGE", "HISTORICAL"]).default("SPOT"),
  rate: rateValue,
  validFrom: z.coerce.date(),
});

// ───────── Phase 2: Bank Account (M4) ─────────
export const bankAccountSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  code: z.string().min(1, "Code is required").max(40),
  name: z.string().min(1, "Name is required").max(150),
  type: z.enum(["BANK", "MOBILE_MONEY", "CASH"]).default("BANK"),
  glCode: z.string().min(1, "GL account code is required").max(20),
  currency: z.string().length(3).default("USD"),
  iban: z.string().max(40).optional().or(z.literal("")),
  swift: z.string().max(20).optional().or(z.literal("")),
  provider: z.string().max(60).optional().or(z.literal("")),
  accountNo: z.string().max(40).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

// ───────── Phase 2: Money Transfer / disbursement (M4) ─────────
export const moneyTransferSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  reference: z.string().min(1, "Reference is required").max(60),
  bankAccountId: idSchema,
  driverId: idSchema.optional(),
  type: z
    .enum(["FUEL_ALLOWANCE", "TOLLS", "BORDER_FEES", "EMERGENCY_REPAIR", "DRIVER_ADVANCE", "OTHER"])
    .default("OTHER"),
  amount: decimalAmount,
  currency: z.string().length(3).default("USD"),
  expenseCode: z.string().min(1).max(20).default("5030"),
  externalRef: z.string().max(100).optional(),
  transferredAt: z.coerce.date(),
  memo: z.string().max(255).optional(),
  post: z.boolean().optional().default(false), // settle (SUCCESS) immediately
});

// ───────── Phase 2: Budget & lines (M3) ─────────
export const budgetLineSchema = z.object({
  kind: z.enum(["CAPEX", "OPEX"]).default("OPEX"),
  costCenter: z.string().min(1, "Cost center is required").max(100),
  accountCode: z.string().min(1, "Account code is required").max(20),
  amount: decimalAmount,
  note: z.string().max(255).optional(),
});

export const budgetSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  name: z.string().min(1, "Name is required").max(150),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  control: z.enum(["STRICT_BLOCK", "WARNING_ONLY", "OVERRIDE"]).default("WARNING_ONLY"),
  isActive: z.boolean().default(true),
  lines: z.array(budgetLineSchema).default([]),
});

// ───────── Phase 2: Consolidation mapping (M5) ─────────
export const consolidationMapSchema = z.object({
  parentArea: z.string().min(1).max(10).default("HQ01"),
  subsidiary: z.string().min(1, "Subsidiary entity is required").max(10),
  subAccount: z.string().min(1).max(20),
  parentAccount: z.string().min(1).max(20),
});

export type DriverInput = z.infer<typeof driverSchema>;
export type VehicleInput = z.infer<typeof vehicleSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type DispatchInput = z.infer<typeof dispatchSchema>;
export type DailyReportInput = z.infer<typeof dailyReportSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type TripInput = z.infer<typeof tripSchema>;
export type TripExpenseInput = z.infer<typeof tripExpenseSchema>;
export type VendorInput = z.infer<typeof vendorSchema>;
export type VendorInvoiceInput = z.infer<typeof vendorInvoiceSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerInvoiceInput = z.infer<typeof customerInvoiceSchema>;
export type ExchangeRateInput = z.infer<typeof exchangeRateSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type MoneyTransferInput = z.infer<typeof moneyTransferSchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;
export type ConsolidationMapInput = z.infer<typeof consolidationMapSchema>;
export type DriverDocumentInput = z.infer<typeof driverDocumentSchema>;
export type WaypointInput = z.infer<typeof waypointSchema>;
export type TripReconInput = z.infer<typeof tripReconSchema>;

// ── Inventory (M14) ──
export const stockItemSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  code: z.string().min(1, "Code is required").max(40),
  name: z.string().min(1, "Name is required").max(150),
  category: z.enum(["SPARE_PART", "FUEL", "TYRE", "LUBRICANT", "CONSUMABLE", "OTHER"]).default("SPARE_PART"),
  unit: z.enum(["PIECE", "LITRE", "KG", "SET", "METRE", "BOX"]).default("PIECE"),
  glCode: z.string().min(1).max(20).default("1300"),
  expenseCode: z.string().min(1).max(20).default("5100"),
  reorderLevel: z.coerce.number().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  isActive: z.boolean().default(true),
});

export const stockMovementSchema = z.object({
  stockItemId: z.string().min(1, "Item is required"),
  type: z.enum(["RECEIPT", "ISSUE"]),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitCost: z.coerce.number().min(0).optional(), // required for RECEIPT
  reference: z.string().max(80).optional().or(z.literal("")),
  memo: z.string().max(300).optional().or(z.literal("")),
});

export type StockItemInput = z.infer<typeof stockItemSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;

// ── Procurement (M15) ──
export const poLineSchema = z.object({
  stockItemId: z.string().optional().nullable(),
  description: z.string().min(1, "Description is required").max(200),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().min(0, "Price must be ≥ 0"),
  expenseCode: z.string().min(1).max(20).default("5100"),
});

export const purchaseOrderSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  vendorId: z.string().min(1, "Vendor is required"),
  currency: z.string().length(3).default("USD"),
  orderDate: z.coerce.date(),
  expectedAt: z.coerce.date().optional().nullable(),
  memo: z.string().max(300).optional().or(z.literal("")),
  lines: z.array(poLineSchema).min(1, "At least one line is required"),
});

export const goodsReceiptSchema = z.object({
  receivedAt: z.coerce.date().optional(),
  note: z.string().max(300).optional().or(z.literal("")),
  lines: z
    .array(z.object({ purchaseOrderLineId: z.string().min(1), quantity: z.coerce.number().positive() }))
    .min(1, "At least one receipt line is required"),
});

export const matchSchema = z.object({ vendorInvoiceId: z.string().min(1, "Vendor invoice is required") });

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;
