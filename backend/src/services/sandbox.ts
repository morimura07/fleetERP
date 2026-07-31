import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

/**
 * Demo / sandbox partition (M32). A company flagged `isSandbox` is a throwaway
 * demo area — every business record carries its `dataAreaId`, so the data is
 * already isolated from real entities. This service lets an admin provision such
 * a partition and safely RESET it (wipe + re-seed a demo baseline). The reset is
 * hard-guarded: it refuses to touch any company that is not a sandbox, so real
 * data can never be wiped through this path.
 */

/**
 * Business tables carrying `dataAreaId`, in leaf-first (child→parent) order so a
 * plain DELETE per table respects foreign keys. `users` is intentionally omitted
 * — accounts are auth entities, not demo business data, and wiping them could
 * lock someone out. Non-`dataAreaId` child rows (journal lines, trip expenses,
 * order lines, …) cascade automatically from their parent.
 */
const SANDBOX_WIPE_ORDER = [
  // deepest line items / logs / documents
  "sales_quote_lines", "pos_sale_lines", "stock_item_attributes",
  "service_parts", "service_labor", "collection_activities", "goods_receipts",
  "depreciation_entries", "asset_assignments",
  "damage_reports", "customer_feedback", "dock_events",
  "vehicle_positions", "vehicle_maintenances",
  "driver_documents", "driver_availabilities", "holidays",
  "employee_documents", "employment_contracts", "leave_requests", "leave_balances",
  "time_entries", "timesheets",
  "money_transfers", "dispatches", "daily_reports",
  // transactions
  "pos_sales", "sales_quotes", "service_orders", "purchase_orders", "stock_movements",
  "demand_forecasts", "fiscal_periods", "budgets", "exchange_rates",
  "customer_invoices", "vendor_invoices", "expense_claims", "pay_runs",
  "trips", "delivery_jobs", "leads",
  "orders",
  // masters
  "projects", "fixed_assets", "product_attributes", "stock_items", "warehouses",
  "vehicles", "drivers", "employees",
  "clients", "customers", "vendors", "bank_accounts", "gps_waypoints",
  // financial core (journal lines cascade from journal_entries)
  "journal_entries", "accounts",
] as const;

/** Core chart of accounts the demo baseline needs to be functional. */
const CORE_ACCOUNTS: { code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" }[] = [
  { code: "1000", name: "Cash on Hand", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "1300", name: "Inventory", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2300", name: "Accrued Expenses", type: "LIABILITY" },
  { code: "3000", name: "Share Capital", type: "EQUITY" },
  { code: "4000", name: "Freight Revenue", type: "INCOME" },
  { code: "4100", name: "Demurrage Income", type: "INCOME" },
  { code: "4300", name: "Retail Sales Revenue", type: "INCOME" },
  { code: "5000", name: "Fuel Expense", type: "EXPENSE" },
  { code: "5100", name: "Vehicle Maintenance & Repairs", type: "EXPENSE" },
  { code: "5300", name: "Cost of Goods Sold", type: "EXPENSE" },
  { code: "6200", name: "Bad Debt Expense", type: "EXPENSE" },
];

async function requireSandboxCompany(code: string) {
  const company = await prisma.company.findUnique({ where: { code } });
  if (!company) throw new AuthError("Sandbox company not found", 404);
  if (!company.isSandbox) throw new AuthError("Refusing to reset a non-sandbox company", 422);
  return company;
}

/** Delete every business record in the sandbox partition (leaf-first). */
export async function wipeSandboxData(dataAreaId: string) {
  for (const table of SANDBOX_WIPE_ORDER) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "dataAreaId" = $1`, dataAreaId);
  }
}

/** Seed a minimal, functional demo baseline into the sandbox partition. Codes,
 * plates and emails are scoped by `dataAreaId` because several of them are
 * globally unique (vehicle plate/number, driver email), so two sandboxes — or a
 * sandbox alongside real data — must not collide. */
export async function seedSandboxDemo(dataAreaId: string) {
  const yr = new Date(Date.now() + 365 * 86_400_000);
  for (const a of CORE_ACCOUNTS) {
    await prisma.account.create({ data: { dataAreaId, code: a.code, name: a.name, type: a.type } });
  }
  const client = await prisma.client.create({
    data: { dataAreaId, companyName: "Demo Shipper Ltd", contactPerson: "Sample Contact", phone: "+255700000000", address: "Dar es Salaam", email: `shipper-${dataAreaId}@sandbox.local` },
  });
  await prisma.customer.create({ data: { dataAreaId, code: `${dataAreaId}-CST1`, name: "Demo Customer" } });
  await prisma.vendor.create({ data: { dataAreaId, code: `${dataAreaId}-VND1`, legalName: "Demo Vendor Ltd" } });
  const driver = await prisma.driver.create({ data: { dataAreaId, name: "Sample Driver", phone: "+255700000001", address: "Dar es Salaam", email: `driver-${dataAreaId}@sandbox.local`, joinedAt: new Date() } });
  const vehicle = await prisma.vehicle.create({ data: { dataAreaId, vehicleNumber: `${dataAreaId}-V1`, plateNumber: `${dataAreaId}-001`, maker: "Scania", model: "R500", insuranceExpiry: yr, inspectionExpiry: yr } });
  const order = await prisma.order.create({
    data: { dataAreaId, orderCode: `${dataAreaId}-ORD1`, clientId: client.id, originZone: "Dar es Salaam Port", destinationZone: "Kigali Depot", cargoDescription: "Demo cargo", freightAmount: "3500", bookingDate: new Date() },
  });
  await prisma.trip.create({
    data: { dataAreaId, tripCode: `${dataAreaId}-TRIP1`, orderId: order.id, driverId: driver.id, vehicleId: vehicle.id, scheduledStart: new Date(), scheduledEnd: new Date(Date.now() + 3 * 86_400_000), driverWages: "500", tollPermitCost: "150", miscExpense: "50" },
  });
}

export interface SandboxStatus {
  code: string;
  name: string;
  isSandbox: true;
  counts: { orders: number; trips: number; clients: number; customers: number; vehicles: number; accounts: number };
}

/** List the sandbox companies with headline record counts. */
export async function sandboxStatus(): Promise<SandboxStatus[]> {
  const companies = await prisma.company.findMany({ where: { isSandbox: true }, orderBy: { code: "asc" } });
  const out: SandboxStatus[] = [];
  for (const co of companies) {
    const dataAreaId = co.code;
    const [orders, trips, clients, customers, vehicles, accounts] = await Promise.all([
      prisma.order.count({ where: { dataAreaId } }),
      prisma.trip.count({ where: { dataAreaId } }),
      prisma.client.count({ where: { dataAreaId } }),
      prisma.customer.count({ where: { dataAreaId } }),
      prisma.vehicle.count({ where: { dataAreaId } }),
      prisma.account.count({ where: { dataAreaId } }),
    ]);
    out.push({ code: co.code, name: co.name, isSandbox: true, counts: { orders, trips, clients, customers, vehicles, accounts } });
  }
  return out;
}

const CODE_RE = /^[A-Z][A-Z0-9]{1,9}$/;

/** Create (or ensure) a sandbox company and seed its demo baseline. */
export async function provisionSandbox(code: string, name: string, userId?: string | null) {
  const key = code.trim().toUpperCase();
  if (!CODE_RE.test(key)) throw new AuthError("Company code must be 2–10 upper-case letters/digits", 422);
  const existing = await prisma.company.findUnique({ where: { code: key } });
  if (existing && !existing.isSandbox) throw new AuthError(`Company ${key} already exists and is not a sandbox`, 409);

  const company = await prisma.company.upsert({
    where: { code: key },
    update: { isSandbox: true, name: name.trim() || key, updatedById: userId ?? null },
    create: { code: key, name: name.trim() || key, isSandbox: true, createdById: userId ?? null },
  });
  // Fresh baseline: wipe anything already there, then seed.
  await wipeSandboxData(key);
  await seedSandboxDemo(key);
  return company;
}

/** Reset a sandbox partition — GUARDED to sandbox companies only. */
export async function resetSandbox(code: string) {
  const company = await requireSandboxCompany(code);
  await wipeSandboxData(company.code);
  await seedSandboxDemo(company.code);
  return company;
}
