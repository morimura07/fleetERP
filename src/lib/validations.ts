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
