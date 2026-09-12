import { z } from "zod";
import { CURRENCY_CODES } from "@frontend/lib/currency";

/**
 * A currency must be one the system offers, not any 3 characters — the client
 * asked for a fixed dropdown so an order's currency can be relied on downstream
 * (invoices, FX, consolidation). Extend the list in `lib/currency.ts`.
 */
export const currencyCode = z.enum(CURRENCY_CODES);

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
const os = (max: number) => z.string().max(max).optional().or(z.literal(""));
// Like `os` but also accepts null (forms send null for empty optional fields).
const optText = (max: number) => z.string().max(max).nullish().or(z.literal(""));

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
  // Identity & contact (spec §1)
  dateOfBirth: z.coerce.date().optional().nullable(),
  gender: os(20),
  altPhone: os(30),
  homeTerminal: os(120),
  emergencyContact: os(200),
  // Qualifications (spec §2)
  licenseNumber: os(60),
  licenseClass: os(60),
  licenseExpiry: z.coerce.date().optional().nullable(),
  medicalCertExpiry: z.coerce.date().optional().nullable(),
  passportNumber: os(60),
  passportExpiry: z.coerce.date().optional().nullable(),
  // Employment & payroll (spec §3)
  driverType: z.enum(["COMPANY", "OWNER_OPERATOR", "SUBCONTRACTOR"]).default("COMPANY"),
  terminationDate: z.coerce.date().optional().nullable(),
  payScale: os(120),
  taxId: os(60),
  // HOS & telematics (spec §4–5)
  eldId: os(60),
  hosCycleRule: os(40),
  terminalTimeZone: os(40),
  assignedVehicle: os(60),
  cargoQualifications: os(200),
  languagePref: os(40),
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
const onum = () => z.coerce.number().min(0).optional().nullable();

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
  // Identification & specs (spec §1)
  vin: os(40),
  yearMade: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  vehicleType: os(60),
  bodyType: os(60),
  // Fixed list, unlike vehicleType above: Master Planning matches a forecast
  // to the trucks that can serve it, which needs one shared vocabulary.
  equipmentType: z.enum(["FLATBED", "DRY_VAN", "REEFER", "TANKER", "CONTAINER_20FT", "CONTAINER_40FT", "CURTAIN_SIDE", "LTL", "OTHER"]).nullish(),
  // Physical & technical (spec §2)
  tareWeightKg: onum(),
  gvwKg: onum(),
  payloadKg: onum(),
  loadingVolumeCbm: onum(),
  dimensions: os(80),
  axleCount: z.coerce.number().int().min(0).optional().nullable(),
  suspensionType: os(60),
  // Compliance (spec §3)
  registrationExpiry: z.coerce.date().optional().nullable(),
  insurancePolicyNo: os(60),
  emissionRating: os(40),
  operatingPermit: os(60),
  // Operations & telematics (spec §4)
  ownershipStatus: z.enum(["OWNED", "LEASED", "SUBCONTRACTED"]).default("OWNED"),
  transporterName: os(120),
  fuelType: z.enum(["DIESEL", "PETROL", "ELECTRIC", "HYBRID", "CNG", "OTHER"]).optional().nullable(),
  fuelCardNumber: os(60),
  telematicsId: os(60),
  homeTerminal: os(120),
  assignedDriver: os(120),
  // Pre-fills the trip form when this vehicle is chosen.
  defaultDriverId: z.string().nullish(),
  // Maintenance (spec §5)
  odometerKm: z.coerce.number().int().min(0).optional().nullable(),
  engineNumber: os(60),
  tyreSize: os(40),
  batterySpec: os(60),
  lastServiceDate: z.coerce.date().optional().nullable(),
  lastServiceKm: z.coerce.number().int().min(0).optional().nullable(),
  // Financial & asset (spec §6)
  assetAccountCode: os(20),
  purchaseDate: z.coerce.date().optional().nullable(),
  purchasePrice: onum(),
  depreciationMethod: os(40),
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
  // Coordinate & facility (spec §1–2)
  altitude: z.coerce.number().optional().nullable(),
  locationType: os(40),
  address: os(255),
  geofenceRadius: z.coerce.number().int().min(0).optional().nullable(),
  timeZone: os(40),
  contactDetails: os(200),
  // Operational rules (spec §3)
  serviceTimeMin: z.coerce.number().int().min(0).optional().nullable(),
  requiredEquipment: os(120),
  accessRestrictions: os(200),
  sequenceNo: z.coerce.number().int().min(0).optional().nullable(),
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
  // General & contact (spec §1)
  tradeName: z.string().max(150).optional().or(z.literal("")),
  industry: z.string().max(80).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_HOLD", "PROSPECT", "SUSPENDED"]).default("ACTIVE"),
  website: z.string().max(200).optional().or(z.literal("")),
  // Billing & financial (spec §2)
  tin: z.string().max(50).optional().or(z.literal("")),
  currency: currencyCode.default("USD"),
  paymentTerm: z.enum(["NET_30", "NET_60", "COD"]).default("NET_30"),
  creditLimit: z.coerce.number().min(0).default(0),
  taxExempt: z.boolean().default(false),
  // Freight profile (spec §3)
  shippingPreferences: z.string().max(120).optional().or(z.literal("")),
  preferredCarriers: z.string().max(200).optional().or(z.literal("")),
  hazmatCertified: z.boolean().default(false),
  // Compliance & integration (spec §5–6)
  insuranceRequirement: z.string().max(200).optional().or(z.literal("")),
  slaExpiry: z.coerce.date().optional().nullable(),
  accountManager: z.string().max(120).optional().or(z.literal("")),
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
  // Classification & posting behaviour (spec: COA §1, §4)
  subType: z.enum(["CURRENT_ASSET", "FIXED_ASSET", "CURRENT_LIABILITY", "LONG_TERM_LIABILITY", "EQUITY", "OPERATING_REVENUE", "OTHER_REVENUE", "COST_OF_SALES", "OPERATING_EXPENSE", "OTHER_EXPENSE", "NONE"]).default("NONE"),
  postingType: z.enum(["POSTABLE", "HEADER", "CONTROL"]).default("POSTABLE"),
  currency: z.string().max(3).optional().or(z.literal("")),
  defaultTaxCode: z.string().max(20).optional().or(z.literal("")),
  reconciliation: z.boolean().default(false),
  allowManualPosting: z.boolean().default(true),
  budgetingAllowed: z.boolean().default(false),
  // Transport dimensions (spec: COA §2)
  fleetSegment: z.string().max(80).optional().or(z.literal("")),
  routeCorridor: z.string().max(80).optional().or(z.literal("")),
  costCenter: z.string().max(80).optional().or(z.literal("")),
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
  // Line detail & operational dimensions (spec: Journal §2, §3)
  taxCode: z.string().max(20).optional().or(z.literal("")),
  openItemRef: z.string().max(80).optional().or(z.literal("")),
  vehicleTag: z.string().max(60).optional().or(z.literal("")),
  routeTag: z.string().max(60).optional().or(z.literal("")),
  costCenter: z.string().max(80).optional().or(z.literal("")),
  driverTag: z.string().max(60).optional().or(z.literal("")),
  partyTag: z.string().max(60).optional().or(z.literal("")),
  tripTag: z.string().max(60).optional().or(z.literal("")),
});

export const journalEntrySchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  postingDate: z.coerce.date(),
  currency: currencyCode.default("USD"),
  exchangeRate: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, "Invalid exchange rate")
    .optional()
    .default("1"),
  memo: z.string().max(500).optional(),
  post: z.boolean().optional().default(false), // post immediately vs save as draft
  lines: z.array(journalLineSchema).min(2, "A journal entry needs at least 2 lines"),
  // Document header (spec: Journal §1)
  docType: z.enum(["GENERAL", "ACCRUAL", "DEPRECIATION", "CASH_DISBURSEMENT", "CASH_RECEIPT", "ADJUSTMENT"]).default("GENERAL"),
  documentDate: z.coerce.date().optional().nullable(),
  referenceNo: z.string().max(100).optional().or(z.literal("")),
});

// ───────── Freight: Order (Order) ─────────
const decimalAmount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive number with up to 2 decimals");

const EQUIPMENT = ["FLATBED", "DRY_VAN", "REEFER", "TANKER", "CONTAINER_20FT", "CONTAINER_40FT", "CURTAIN_SIDE", "LTL", "OTHER"] as const;
const oStr = (max: number) => z.string().max(max).optional().or(z.literal(""));

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
  currency: currencyCode.default("USD"),
  bookingDate: z.coerce.date(),
  status: z
    .enum(["DRAFT", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "INVOICED", "CANCELLED"])
    .default("DRAFT"),
  // Organizational (spec §1)
  branch: oStr(120),
  salesperson: oStr(120),
  incoterms: oStr(10),
  paymentTerm: z.enum(["NET_30", "NET_60", "COD"]).default("NET_30"),
  // Parties (spec §2)
  shipper: oStr(150),
  consignee: oStr(150),
  billTo: oStr(150),
  notifyParty: oStr(150),
  // Routing (spec §3)
  pickupAddress: oStr(255),
  deliveryAddress: oStr(255),
  pol: oStr(80),
  pod: oStr(80),
  etd: z.coerce.date().optional().nullable(),
  eta: z.coerce.date().optional().nullable(),
  routingNotes: oStr(300),
  // Cargo & equipment (spec §4)
  equipmentType: z.enum(EQUIPMENT).default("OTHER"),
  pieceCount: z.coerce.number().int().min(0).optional().nullable(),
  dimensions: oStr(80),
  hazmat: z.boolean().default(false),
  hazmatUnCode: oStr(40),
  // Financial (spec §5)
  freightRate: z.coerce.number().min(0).optional().nullable(),
  accessorialCharges: decimalAmount.optional().default("0"),
  taxAmount: decimalAmount.optional().default("0"),
  // Documentation (spec §6)
  customerPo: oStr(80),
  blNumber: oStr(80),
  hsCode: oStr(40),
  sealNumber: oStr(40),
  specialInstructions: oStr(500),
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
  // Vehicle & crew (spec §1)
  trailerId: oStr(60),
  secondDriverId: z.string().optional().nullable(),
  actualStart: z.coerce.date().optional().nullable(),
  actualEnd: z.coerce.date().optional().nullable(),
  // Route (spec §2)
  originFacility: oStr(150),
  destinationFacility: oStr(150),
  viaPoints: oStr(300),
  plannedDistanceKm: z.coerce.number().min(0).optional().nullable(),
  routeCode: oStr(60),
  // Freight (spec §3)
  waybillNumber: oStr(80),
  cargoWeightKg: z.coerce.number().min(0).optional().nullable(),
  packageCount: z.coerce.number().int().min(0).optional().nullable(),
  specialHandling: oStr(200),
  // Financials (spec §4)
  advancePayment: decimalAmount.optional().default("0"),
  driverWages: decimalAmount.optional().default("0"),
  tollPermitCost: decimalAmount.optional().default("0"),
  miscExpense: decimalAmount.optional().default("0"),
  // Fuel management (spec §5)
  fuelType: oStr(40),
  fuelCardNumber: oStr(60),
  refuelStations: oStr(200),
  // Compliance & safety (spec §6)
  ewayBillRef: oStr(80),
  podStatus: z.boolean().default(false),
  podUrl: oStr(300),
  sealNumbers: oStr(120),
  incidentNotes: oStr(500),
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
  currency: currencyCode.default("USD"),
  note: z.string().max(255).optional(),
  post: z.boolean().optional().default(false), // post to ledger immediately
});

// ───────── AP: Vendor (M1) ─────────
const money0 = decimalAmount.optional().default("0");

const optStr = (max: number) => z.string().max(max).optional().or(z.literal(""));

export const vendorSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  code: z.string().min(1, "Vendor code is required").max(30),
  legalName: z.string().min(1, "Legal name is required").max(150),
  group: z
    .enum(["FUEL_SUPPLIER", "SPARE_PARTS", "CLEARING_AGENT", "SUBCONTRACTED_FLEET", "STATUTORY", "CARRIER", "FREIGHT_BROKER", "OWNER_OPERATOR", "WORKSHOP", "OTHER"])
    .default("OTHER"),
  tin: z.string().max(50).optional(),
  vrn: z.string().max(50).optional(),
  paymentTerm: z.enum(["NET_30", "NET_60", "COD"]).default("NET_30"),
  currency: currencyCode.default("USD"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
  // General & organizational (spec §1)
  operatingName: optStr(150),
  searchTerm: optStr(60),
  parentCompany: optStr(150),
  // Contact & compliance (spec §2)
  address: optStr(255),
  branchAddress: optStr(255),
  contactPerson: optStr(100),
  billingContact: optStr(100),
  insurancePolicy: optStr(80),
  insuranceExpiry: z.coerce.date().optional().nullable(),
  licenseNumber: optStr(80),
  // Financial (spec §3)
  paymentMethod: z.enum(["EFT", "WIRE", "CHEQUE", "CASH", "MOBILE_MONEY", "FUEL_CARD"]).optional().nullable(),
  bankName: optStr(120),
  bankSwift: optStr(20),
  bankIban: optStr(40),
  mobileMoney: optStr(40),
  reconAccount: optStr(20),
  // Transport / TMS (spec §4)
  scacCode: optStr(10),
  mcDotNumber: optStr(40),
  equipmentTypes: optStr(200),
  fleetSize: z.coerce.number().int().min(0).optional().nullable(),
  rateAgreement: optStr(300),
  ediEndpoint: optStr(200),
});

export const vendorInvoiceSchema = z.object({
  vendorId: idSchema,
  invoiceNumber: z.string().min(1, "Invoice number is required").max(60),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  currency: currencyCode.default("USD"),
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
  currency: currencyCode.default("USD"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
  // General (spec §1)
  accountGroup: z.enum(["SOLD_TO", "SHIP_TO", "BILL_TO", "PAYER"]).default("SOLD_TO"),
  industry: optStr(80),
  registrationNo: optStr(60),
  searchTerm: optStr(60),
  // Address & geocoding (spec §2)
  billingAddress: optStr(255),
  city: optStr(80),
  country: optStr(2),
  postalCode: optStr(20),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  transportZone: optStr(80),
  timeZone: optStr(40),
  // Contact (spec §3)
  contactPerson: optStr(100),
  apContact: optStr(100),
  // Freight profile (spec §4)
  shippingConditions: optStr(80),
  meansOfTransport: optStr(80),
  dockRestrictions: optStr(200),
  hazmatCertified: z.boolean().default(false),
  // Financial & operational (spec §5–6)
  incoterms: optStr(10),
  paymentTerm: z.enum(["NET_30", "NET_60", "COD"]).default("NET_30"),
  reconAccount: optStr(20),
  preferredCarrier: optStr(120),
  communicationLang: optStr(40),
  // Credit & collections (spec: Collections §1–3)
  accountStatus: z.enum(["ACTIVE", "INACTIVE", "ON_HOLD", "PROSPECT", "SUSPENDED"]).default("ACTIVE"),
  parentAccount: optStr(120),
  creditRating: optStr(40),
  tempCreditLimit: z.coerce.number().min(0).optional().nullable(),
  creditReviewDate: z.coerce.date().optional().nullable(),
  creditHoldOverride: z.boolean().default(false),
  collectionStrategy: optStr(80),
  collectorId: optStr(60),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  discountDays: z.coerce.number().int().min(0).max(365).default(0),
  penaltyRate: z.coerce.number().min(0).max(100).default(0),
  podRequired: z.boolean().default(false),
});

export const customerInvoiceSchema = z.object({
  customerId: idSchema,
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  currency: currencyCode.default("USD"),
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
  currency: currencyCode,
  baseCurrency: currencyCode.default("USD"),
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
  currency: currencyCode.default("USD"),
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
  currency: currencyCode.default("USD"),
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
  currency: currencyCode.default("USD"),
  isActive: z.boolean().default(true),
  // Identification & fleet (spec §1–2)
  oemPartNumber: os(60),
  supplierPartNumber: os(60),
  applicableFleet: os(120),
  partCondition: os(40),
  assetSerialNo: os(60),
  hazmat: z.boolean().default(false),
  // Purchasing & financial (spec §3)
  standardCost: z.coerce.number().min(0).optional().nullable(),
  lastPurchasePrice: z.coerce.number().min(0).optional().nullable(),
  defaultVendor: os(120),
  taxCode: os(20),
  valuationMethod: os(20),
  // Warehousing & location (spec §4)
  storageLocation: os(80),
  binRack: os(40),
  batchLot: os(60),
  manufactureDate: z.coerce.date().optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  // Inventory control (spec §5)
  maxStockLevel: z.coerce.number().min(0).optional().nullable(),
  safetyStock: z.coerce.number().min(0).optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
  economicOrderQty: z.coerce.number().min(0).optional().nullable(),
  // Warranty & quality (spec §6)
  warrantyPeriod: os(60),
  warrantyStart: z.coerce.date().optional().nullable(),
  qualityStatus: os(40),
});

export const stockMovementSchema = z.object({
  stockItemId: z.string().min(1, "Item is required"),
  type: z.enum(["RECEIPT", "ISSUE"]),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitCost: z.coerce.number().min(0).optional(),
  warehouseId: z.string().optional().nullable(),
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
  currency: currencyCode.default("USD"),
  orderDate: z.coerce.date(),
  expectedAt: z.coerce.date().optional().nullable(),
  memo: z.string().max(300).optional().or(z.literal("")),
  lines: z.array(poLineSchema).min(1, "At least one line is required"),
});

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type PoLineInput = z.infer<typeof poLineSchema>;

// ── Payroll (M9) ──
export const employeeSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  code: z.string().min(1, "Code is required").max(40),
  name: z.string().min(1, "Name is required").max(150),
  nationalId: z.string().max(40).optional().or(z.literal("")),
  tin: z.string().max(40).optional().or(z.literal("")),
  country: z.string().length(2).default("TZ"),
  grossSalary: z.coerce.number().positive("Gross salary must be positive"),
  currency: currencyCode.default("USD"),
  status: z.enum(["ACTIVE", "ON_LEAVE", "TERMINATED"]).default("ACTIVE"),
  bankAccount: z.string().max(60).optional().or(z.literal("")),
  hiredAt: z.coerce.date(),
  // Master data & demographics (spec: Payroll §1)
  jobTitle: os(120),
  employmentType: os(40),
  department: os(80),
  costCenter: os(80),
  payFrequency: os(20),
  nssfNumber: os(40),
  shifNumber: os(40),
  // Standing allowances (spec: Payroll §4)
  perDiem: z.coerce.number().min(0).default(0),
  overnightAllowance: z.coerce.number().min(0).default(0),
  phoneAllowance: z.coerce.number().min(0).default(0),
  otherAllowance: z.coerce.number().min(0).default(0),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;

// ── Warehouse (M18) ──
export const warehouseSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  code: z.string().min(1, "Code is required").max(40),
  name: z.string().min(1, "Name is required").max(150),
  location: z.string().max(150).optional().or(z.literal("")),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  // Identification & geocoding (spec §1–2)
  facilityType: z.enum(["DISTRIBUTION_CENTER", "CROSS_DOCK", "TRANSIT_HUB", "BONDED_WAREHOUSE", "YARD", "OTHER"]).default("DISTRIBUTION_CENTER"),
  timeZone: os(40),
  address: os(255),
  city: os(80),
  country: os(2),
  postalCode: os(20),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  // Contact (spec §3)
  managerName: os(120),
  phone: os(30),
  email: z.string().email().optional().or(z.literal("")),
  // Dock & operations (spec §4)
  dockCapacity: z.coerce.number().int().min(0).optional().nullable(),
  dockScheduling: os(60),
  operatingHours: os(120),
  // Capacity & control (spec §5–6)
  storageTypes: os(200),
  capacityLimit: os(120),
  putawayStrategy: os(80),
  pickingStrategy: os(80),
  countMethod: os(40),
});

export type WarehouseInput = z.infer<typeof warehouseSchema>;

// ── Expense management (M23) ──
export const expenseLineSchema = z.object({
  expenseCode: z.string().min(1, "Expense account is required").max(20),
  description: z.string().min(1, "Description is required").max(200),
  amount: z.coerce.number().positive("Amount must be positive"),
  incurredAt: z.coerce.date(),
  receiptUrl: z.string().max(300).optional().nullable(),
  // Ties the cost to the asset and run that caused it (client amendments, Aug 2026).
  postingDate: z.coerce.date().optional().nullable(),
  voucherRef: os(60),
  vehicleId: z.string().nullish(),
  tripId: z.string().nullish(),
  odometerKm: z.coerce.number().int().min(0).nullish(),
  taxAmount: z.coerce.number().min(0).default(0),
});

export const expenseClaimSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  driverId: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required").max(150),
  currency: currencyCode.default("USD"),
  advanceId: z.string().optional().nullable(),
  // Allocation (client amendments, Aug 2026).
  costCenter: os(80),
  branch: os(80),
  lines: z.array(expenseLineSchema).min(1, "At least one line is required"),
});

export type ExpenseClaimInput = z.infer<typeof expenseClaimSchema>;
export type ExpenseLineInput = z.infer<typeof expenseLineSchema>;

// ── Company / legal entity (M34) ──
export const companySchema = z.object({
  code: z.string().min(1, "Code is required").max(10).regex(/^[A-Z0-9]+$/, "Code must be uppercase letters/digits"),
  name: z.string().min(1, "Name is required").max(150),
  baseCurrency: currencyCode.default("USD"),
  country: z.string().length(2).default("TZ"),
  isActive: z.boolean().default(true),
  // Parent organization. Honoured only for SUPER_ADMIN — an ADMIN always creates
  // inside their own parent, so the field is ignored rather than trusted.
  organizationId: z.string().cuid().optional(),
  // Commercial profile (client amendments, Aug 2026).
  kind: z.enum(["OPERATING", "CLIENT", "VENDOR", "PARTNER"]).default("OPERATING"),
  registrationNumber: os(60),
  taxId: os(60),
  industry: os(80),
  paymentTerm: z.enum(["NET_30", "NET_60", "COD"]).default("NET_30"),
  creditLimit: z.coerce.number().min(0).nullish(),
});
export type CompanyInput = z.infer<typeof companySchema>;

export const organizationSchema = z.object({
  code: z.string().min(2, "Code is required").max(10).regex(/^[A-Z0-9]+$/, "Code must be uppercase letters/digits"),
  name: z.string().min(1, "Name is required").max(150),
  isActive: z.boolean().default(true),
});
export type OrganizationInput = z.infer<typeof organizationSchema>;

// ── Fixed Assets (M20) ──
export const fixedAssetSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  code: z.string().min(1, "Asset tag is required").max(40),
  name: z.string().min(1, "Name is required").max(150),
  category: z.enum(["VEHICLE", "EQUIPMENT", "FURNITURE", "BUILDING", "IT", "OTHER"]).default("EQUIPMENT"),
  // Set when the asset IS a truck, so its depreciation counts toward that
  // vehicle's cost of ownership.
  vehicleId: z.string().nullish(),
  acquisitionCost: z.coerce.number().positive("Acquisition cost must be positive"),
  residualValue: z.coerce.number().min(0, "Residual value cannot be negative").default(0),
  usefulLifeMonths: z.coerce.number().int().positive("Useful life must be a positive number of months"),
  acquisitionDate: z.coerce.date(),
  inServiceDate: z.coerce.date(),
  assetAccountCode: z.string().max(20).default("1500"),
  accumDepCode: z.string().max(20).default("1510"),
  expenseCode: z.string().max(20).default("5200"),
  warrantyProvider: optText(120),
  warrantyExpiresAt: z.coerce.date().optional().nullable(),

  // ── Identification (client requirements, Sept 2026, §1) ──
  assetGroup: optText(120),
  inventoryNumber: optText(60),
  serialNumber: optText(80),

  // ── Operational specification (§2) ──
  registrationNumber: optText(40),
  make: optText(80),
  model: optText(80),
  yearMade: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  fuelType: optText(40),
  standardKmPerL: z.coerce.number().min(0).optional().nullable(),
  capacity: optText(120),
  meterReading: z.coerce.number().min(0).optional().nullable(),
  meterUnit: z.enum(["KILOMETRES", "HOURS"]).nullish(),
  telematicsUnitId: optText(60),

  // ── Acquisition (§3) ──
  vendorId: z.string().nullish(),
  purchaseOrderId: z.string().nullish(),
  capitalizationDate: z.coerce.date().optional().nullable(),

  // ── Depreciation parameters (§4) ──
  depreciationMethod: z.enum(["STRAIGHT_LINE", "DECLINING_BALANCE", "UNITS_OF_PRODUCTION"]).default("STRAIGHT_LINE"),
  decliningRatePct: z.coerce.number().min(0).max(100).optional().nullable(),
  totalExpectedUnits: z.coerce.number().min(0).optional().nullable(),
  depreciationStartDate: z.coerce.date().optional().nullable(),

  // ── Assignment and location (§5) ──
  costCenter: optText(80),
  location: optText(120),
  projectId: z.string().nullish(),

  // ── Compliance and insurance (§6) ──
  insuranceProvider: optText(120),
  insurancePolicyNumber: optText(80),
  insuredValue: z.coerce.number().min(0).optional().nullable(),
  insuranceExpiresAt: z.coerce.date().optional().nullable(),
  inspectionDueAt: z.coerce.date().optional().nullable(),

  // ── Origin (§7) ──
  condition: z.enum(["NEW", "USED", "RECONDITIONED"]).default("NEW"),
}).refine((a) => a.residualValue < a.acquisitionCost, {
  message: "Residual value must be less than acquisition cost",
  path: ["residualValue"],
});

export const depreciationRunSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM"),
});

export const assetDisposalSchema = z.object({
  proceeds: z.coerce.number().min(0, "Proceeds cannot be negative"),
  disposalDate: z.coerce.date(),
});

export type FixedAssetInput = z.infer<typeof fixedAssetSchema>;
export type DepreciationRunInput = z.infer<typeof depreciationRunSchema>;
export type AssetDisposalInput = z.infer<typeof assetDisposalSchema>;

// ── Service Management (M22) ──
export const serviceOrderSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  kind: z.enum(["INTERNAL", "EXTERNAL"]).default("INTERNAL"),
  vendorId: z.string().optional().nullable(),
  odometerKm: z.coerce.number().int().min(0).optional().nullable(),
  fault: z.string().min(1, "Describe the fault / service reason").max(500),
  currency: currencyCode.default("USD"),
}).refine((o) => o.kind !== "EXTERNAL" || !!o.vendorId, {
  message: "An external garage requires a vendor",
  path: ["vendorId"],
});

export const servicePartSchema = z.object({
  stockItemId: z.string().min(1, "Part is required"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
});

export const serviceLaborSchema = z.object({
  description: z.string().min(1, "Description is required").max(200),
  hours: z.coerce.number().positive("Hours must be positive"),
  rate: z.coerce.number().min(0, "Rate cannot be negative"),
});

export type ServiceOrderInput = z.infer<typeof serviceOrderSchema>;
export type ServicePartInput = z.infer<typeof servicePartSchema>;
export type ServiceLaborInput = z.infer<typeof serviceLaborSchema>;

// ── Human Resources (M24) ──
export const contractSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  employeeId: z.string().min(1, "Employee is required"),
  type: z.enum(["PERMANENT", "FIXED_TERM", "PROBATION", "CONTRACTOR"]).default("PERMANENT"),
  title: z.string().min(1, "Job title is required").max(120),
  grossSalary: z.coerce.number().positive("Gross salary must be positive"),
  currency: currencyCode.default("USD"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const leaveRequestSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  employeeId: z.string().min(1, "Employee is required"),
  type: z.enum(["ANNUAL", "SICK", "UNPAID", "MATERNITY", "COMPASSIONATE"]).default("ANNUAL"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().max(300).optional().nullable(),
});

export const entitlementSchema = z.object({
  type: z.enum(["ANNUAL", "SICK", "UNPAID", "MATERNITY", "COMPASSIONATE"]),
  year: z.coerce.number().int().min(2000).max(2100),
  entitled: z.coerce.number().int().min(0, "Entitlement cannot be negative"),
});

export const employeeDocSchema = z.object({
  type: z.enum(["CONTRACT", "NATIONAL_ID", "PASSPORT", "WORK_PERMIT", "CERTIFICATE", "OTHER"]),
  number: z.string().max(80).optional().nullable(),
  issuedAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  fileUrl: z.string().max(300).optional().nullable(),
  note: z.string().max(300).optional().nullable(),
});

export type ContractInput = z.infer<typeof contractSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type EntitlementInput = z.infer<typeof entitlementSchema>;
export type EmployeeDocInput = z.infer<typeof employeeDocSchema>;

// ── Time & Attendance (M26) ──
export const timeEntrySchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  employeeId: z.string().min(1, "Employee is required"),
  workDate: z.coerce.date(),
  clockIn: z.coerce.date(),
  clockOut: z.coerce.date().optional().nullable(),
  source: z.enum(["MANUAL", "MOBILE", "BIOMETRIC"]).default("MANUAL"),
  note: z.string().max(200).optional().nullable(),
});

export const clockOutSchema = z.object({
  at: z.coerce.date(),
});

export const buildTimesheetSchema = z.object({
  dataAreaId: z.string().min(1).max(10).default("HQ01"),
  employeeId: z.string().min(1, "Employee is required"),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM"),
  overtimeRate: z.coerce.number().min(0, "Overtime rate cannot be negative").default(0),
});

export type TimeEntryInput = z.infer<typeof timeEntrySchema>;
export type ClockOutInput = z.infer<typeof clockOutSchema>;
export type BuildTimesheetInput = z.infer<typeof buildTimesheetSchema>;

// ── Credit & Collections workflow (M7) ──
export const dunningSchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required"),
  level: z.enum(["NONE", "REMINDER", "FIRST_NOTICE", "SECOND_NOTICE", "FINAL_NOTICE", "LEGAL"]),
  note: z.string().max(500).optional().nullable(),
});

export const disputeSchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required"),
  status: z.enum(["NONE", "OPEN", "UNDER_INVESTIGATION", "RESOLVED", "WRITTEN_OFF"]),
  disputedAmount: z.coerce.number().min(0).default(0),
  note: z.string().max(500).optional().nullable(),
});

export const promiseToPaySchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required"),
  promiseDate: z.coerce.date(),
  promiseAmount: z.coerce.number().positive("Promise amount must be positive"),
  note: z.string().max(500).optional().nullable(),
});

export const contactSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  invoiceId: z.string().optional().nullable(),
  type: z.enum(["CALL", "EMAIL", "LETTER", "NOTE"]),
  note: z.string().max(1000).optional().nullable(),
});

export const writeOffSchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required"),
  note: z.string().max(500).optional().nullable(),
});

export type DunningInput = z.infer<typeof dunningSchema>;
export type DisputeInput = z.infer<typeof disputeSchema>;
export type PromiseToPayInput = z.infer<typeof promiseToPaySchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type WriteOffInput = z.infer<typeof writeOffSchema>;

// ── Operational KPI capture (Tier C internal) ────────────────────────────────

export const dockEventSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  tripId: os(40),
  facility: os(120),
  kind: z.enum(["ARRIVAL", "DEPARTURE"]),
  eventAt: z.coerce.date(),
  note: os(500),
  // Gate and yard detail (client amendments, Aug 2026).
  driverId: z.string().nullish(),
  trailerNumber: os(60),
  dockBay: os(60),
  activity: z.enum(["LOADING", "OFFLOADING", "CUSTOMS_INSPECTION", "CROSS_DOCKING", "OVERNIGHT_STAGING", "OTHER"]).default("OTHER"),
  sealNumber: os(60),
  sealIntact: z.boolean().nullish(),
  odometerKm: z.coerce.number().int().min(0).nullish(),
  fuelLevel: os(30),
  source: z.enum(["MANUAL", "GEOFENCE", "GATE_SCANNER", "MOBILE_APP"]).default("MANUAL"),
});

export const damageReportSchema = z.object({
  orderId: os(40),
  tripId: os(40),
  reportedAt: z.coerce.date(),
  cargoValue: z.coerce.number().min(0, "Cargo value cannot be negative"),
  damageValue: z.coerce.number().min(0, "Damage value cannot be negative"),
  currency: currencyCode.optional(),
  description: os(1000),
  // Incident detail (client amendments, Aug 2026).
  clientId: z.string().nullish(),
  vehicleId: z.string().nullish(),
  driverId: z.string().nullish(),
  incidentType: z.enum(["TRANSIT_DAMAGE", "MOISTURE_DAMAGE", "SHORTAGE_THEFT", "CONTAMINATION_SPILLAGE", "ROAD_ACCIDENT", "OTHER"]).default("TRANSIT_DAMAGE"),
  location: os(200),
  rootCause: z.enum(["DRIVER_NEGLIGENCE", "POOR_PACKAGING", "MECHANICAL_FAILURE", "THIRD_PARTY", "FORCE_MAJEURE", "UNDETERMINED"]).default("UNDETERMINED"),
  liableParty: os(150),
  insurerName: os(150),
  claimNumber: os(80),
  claimStatus: z.enum(["NOT_FILED", "LODGED", "UNDER_ASSESSMENT", "APPROVED", "RECOVERED", "REJECTED"]).default("NOT_FILED"),
  settlementAmount: z.coerce.number().min(0).default(0),
}).refine((d) => d.damageValue <= d.cargoValue, {
  message: "Damage value cannot exceed the cargo value",
  path: ["damageValue"],
});

export const damageStatusSchema = z.object({
  status: z.enum(["REPORTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "SETTLED"]),
});

export const feedbackSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  orderId: os(40),
  csat: z.coerce.number().int().min(1).max(5).optional().nullable(),
  nps: z.coerce.number().int().min(0).max(10).optional().nullable(),
  comment: os(1000),
  collectedAt: z.coerce.date(),
}).refine((d) => d.csat != null || d.nps != null, {
  message: "Provide at least a CSAT or NPS score",
  path: ["csat"],
});

export type DockEventInput = z.infer<typeof dockEventSchema>;
export type DamageReportInput = z.infer<typeof damageReportSchema>;
export type DamageStatusInput = z.infer<typeof damageStatusSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;

// ── Sales & Marketing (M27) ──────────────────────────────────────────────────

export const leadSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(200),
  contactPerson: os(120),
  email: os(160),
  phone: os(40),
  source: os(80),
  stage: z.enum(["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"]).default("NEW"),
  estimatedValue: z.coerce.number().min(0).default(0),
  currency: currencyCode.optional(),
  ownerId: os(40),
  notes: os(1000),
});

export const leadStageSchema = z.object({
  stage: z.enum(["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"]),
});

export const quoteLineSchema = z.object({
  description: z.string().min(1, "Description is required").max(300),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
});

export const quoteSchema = z.object({
  clientId: os(40),
  leadId: os(40),
  salesperson: os(120),
  originZone: os(120),
  destinationZone: os(120),
  cargoDescription: os(300),
  currency: currencyCode.optional(),
  validUntil: z.coerce.date(),
  notes: os(1000),
  lines: z.array(quoteLineSchema).min(1, "Add at least one line item"),
});

export const quoteStatusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]),
});

export type LeadInput = z.infer<typeof leadSchema>;
export type LeadStageInput = z.infer<typeof leadStageSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type QuoteStatusInput = z.infer<typeof quoteStatusSchema>;

// ── Project Management (M29) ─────────────────────────────────────────────────

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  clientId: os(40),
  manager: os(120),
  currency: currencyCode.optional(),
  budgetRevenue: z.coerce.number().min(0).default(0),
  budgetCost: z.coerce.number().min(0).default(0),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  description: os(1000),
});

export const projectStatusSchema = z.object({
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
});

export const orderProjectSchema = z.object({
  orderId: z.string().min(1, "Order is required"),
  projectId: z.string().min(1).nullable(),
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type ProjectStatusInput = z.infer<typeof projectStatusSchema>;
export type OrderProjectInput = z.infer<typeof orderProjectSchema>;

// ── Master Planning (M33) ────────────────────────────────────────────────────

const corridorEnum = z.enum(["NORTHERN", "CENTRAL", "DOMESTIC"]);
const optInt = () => z.coerce.number().int().min(0).optional().nullable();

export const forecastSchema = z.object({
  period: z.string().min(1, "Period is required").max(20),
  corridor: corridorEnum,
  forecastLoads: z.coerce.number().int().min(0).default(0),
  forecastTonnes: z.coerce.number().min(0).default(0),
  plannedTrucks: optInt(),
  plannedDrivers: optInt(),
  notes: os(1000),
  // Planning detail (client amendments, Aug 2026). Turnaround days is what
  // converts a load count into a truck count.
  clientId: z.string().nullish(),
  contractName: os(150),
  cargoType: os(80),
  equipmentClass: z.enum(["FLATBED", "DRY_VAN", "REEFER", "TANKER", "CONTAINER_20FT", "CONTAINER_40FT", "CURTAIN_SIDE", "LTL", "OTHER"]).nullish(),
  // Which version of the future this row describes, so a corridor can hold an
  // optimistic, a base and a pessimistic forecast for the same period.
  scenario: z.enum(["OPTIMISTIC", "BASE", "PESSIMISTIC"]).default("BASE"),
  originHub: os(120),
  destinationHub: os(120),
  turnaroundDays: z.coerce.number().min(0).nullish(),
  projectedRevenue: z.coerce.number().min(0).nullish(),
});

export const forecastUpdateSchema = z.object({
  forecastLoads: z.coerce.number().int().min(0).optional(),
  forecastTonnes: z.coerce.number().min(0).optional(),
  plannedTrucks: optInt(),
  plannedDrivers: optInt(),
  notes: os(1000),
});

export const forecastStatusSchema = z.object({
  status: z.enum(["DRAFT", "CONFIRMED", "ARCHIVED"]),
});

export type ForecastInput = z.infer<typeof forecastSchema>;
export type ForecastUpdateInput = z.infer<typeof forecastUpdateSchema>;
export type ForecastStatusInput = z.infer<typeof forecastStatusSchema>;

// ── Retail / POS (M28) ───────────────────────────────────────────────────────

export const posLineSchema = z.object({
  stockItemId: z.string().min(1, "Stock item is required"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
});

export const posSaleSchema = z.object({
  customerName: os(120),
  paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "CARD"]).default("CASH"),
  currency: currencyCode.optional(),
  taxAmount: z.coerce.number().min(0).default(0),
  note: os(500),
  lines: z.array(posLineSchema).min(1, "Add at least one item"),
});

export type PosLineInput = z.infer<typeof posLineSchema>;
export type PosSaleInput = z.infer<typeof posSaleSchema>;
