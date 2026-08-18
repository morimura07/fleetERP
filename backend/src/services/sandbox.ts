import { randomBytes } from "crypto";
import type { Role } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { hashPassword } from "@backend/lib/password";
import { noteCompanyChanged } from "@backend/services/organization";
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

/**
 * Resolve a sandbox company, refusing anything that is not a sandbox or that
 * belongs to another tenant. `organizationId` is null only for SUPER_ADMIN.
 */
async function requireSandboxCompany(code: string, organizationId: string | null) {
  const company = await prisma.company.findUnique({ where: { code } });
  if (!company) throw new AuthError("Sandbox company not found", 404);
  if (organizationId !== null && company.organizationId !== organizationId) {
    throw new AuthError("Sandbox company not found", 404); // don't leak other tenants
  }
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

/* ─────────────────────── Demo logins (sign-in for a demo) ───────────────────────
 * A sandbox is useless to show a prospect unless somebody can actually sign in.
 * We mint one throwaway account per role, all sharing a single password so the
 * whole set can be handed over as one line. They are flagged `isDemo`, which is
 * what lets us delete exactly these and never a real account.
 * Only the bcrypt hash is stored — the plaintext is returned once, at the moment
 * it is issued, and cannot be read back afterwards. */

const DEMO_LOGINS: { key: string; role: Role; name: string }[] = [
  { key: "admin", role: "ADMIN", name: "Demo Administrator" },
  { key: "dispatcher", role: "DISPATCHER", name: "Demo Operations Planner" },
  { key: "finance", role: "FINANCE", name: "Demo Finance Controller" },
  { key: "staff", role: "STAFF", name: "Demo Staff" },
  { key: "driver", role: "DRIVER", name: "Demo Driver" },
];

/** `.demo` is reserved, so these can never collide with a real corporate mailbox. */
function demoEmail(dataAreaId: string, key: string): string {
  return `${key}@${dataAreaId.toLowerCase()}.demo`;
}

/** Ambiguous glyphs (I/O/0/1) removed — these get read aloud and retyped in demos. */
const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars → no modulo bias

function generateDemoPassword(): string {
  const block = (n: number) =>
    Array.from(randomBytes(n), (b) => PW_ALPHABET[b % PW_ALPHABET.length]).join("");
  return `Demo-${block(4)}-${block(4)}`;
}

export interface SandboxCredentials {
  password: string;
  expiresAt: Date | null;
  users: { email: string; role: Role; name: string }[];
}

/** Point the demo DRIVER login at the sample driver so the driver portal works. */
async function linkDemoDriver(dataAreaId: string) {
  const [user, driver] = await Promise.all([
    prisma.user.findUnique({ where: { email: demoEmail(dataAreaId, "driver") }, select: { id: true } }),
    prisma.driver.findFirst({ where: { dataAreaId }, select: { id: true } }),
  ]);
  if (user && driver) await prisma.driver.update({ where: { id: driver.id }, data: { userId: user.id } });
}

/**
 * Issue a fresh set of demo logins for a partition, replacing any previous set,
 * and return the new password. Deliberately separate from `resetSandbox` so that
 * wiping the demo *data* does not invalidate credentials already handed out.
 */
export async function issueSandboxCredentials(code: string, organizationId: string | null): Promise<SandboxCredentials> {
  const company = await requireSandboxCompany(code, organizationId);
  const dataAreaId = company.code;

  await prisma.user.deleteMany({ where: { dataAreaId, isDemo: true } });

  const password = generateDemoPassword();
  const passwordHash = await hashPassword(password);
  await prisma.user.createMany({
    data: DEMO_LOGINS.map((d) => ({
      name: d.name,
      email: demoEmail(dataAreaId, d.key),
      passwordHash,
      role: d.role,
      dataAreaId,
      isDemo: true,
    })),
  });
  await linkDemoDriver(dataAreaId);

  return {
    password,
    expiresAt: company.sandboxExpiresAt,
    users: DEMO_LOGINS.map((d) => ({ email: demoEmail(dataAreaId, d.key), role: d.role, name: d.name })),
  };
}

/**
 * Whether a partition's access window has closed. Pure — the login path and the
 * UI both read the same rule. A non-sandbox company, or one with no window set,
 * never expires.
 */
export function isSandboxExpired(
  company: { isSandbox: boolean; sandboxExpiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!company.isSandbox || !company.sandboxExpiresAt) return false;
  return company.sandboxExpiresAt.getTime() <= now.getTime();
}

/** Whole days left in the access window; null when it never expires, 0 once past. */
export function sandboxDaysRemaining(
  company: { isSandbox: boolean; sandboxExpiresAt: Date | null },
  now: Date = new Date(),
): number | null {
  if (!company.isSandbox || !company.sandboxExpiresAt) return null;
  const ms = company.sandboxExpiresAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export interface SandboxStatus {
  code: string;
  name: string;
  isSandbox: true;
  expiresAt: Date | null;
  expired: boolean;
  daysRemaining: number | null;
  demoUsers: { email: string; role: Role }[];
  counts: { orders: number; trips: number; clients: number; customers: number; vehicles: number; accounts: number };
}

/** List the sandbox companies with headline record counts. */
export async function sandboxStatus(organizationId: string | null): Promise<SandboxStatus[]> {
  const companies = await prisma.company.findMany({
    // A tenant only ever sees its own demo areas; null is SUPER_ADMIN (all).
    where: { isSandbox: true, ...(organizationId === null ? {} : { organizationId }) },
    orderBy: { code: "asc" },
  });
  const out: SandboxStatus[] = [];
  for (const co of companies) {
    const dataAreaId = co.code;
    const [orders, trips, clients, customers, vehicles, accounts, demoUsers] = await Promise.all([
      prisma.order.count({ where: { dataAreaId } }),
      prisma.trip.count({ where: { dataAreaId } }),
      prisma.client.count({ where: { dataAreaId } }),
      prisma.customer.count({ where: { dataAreaId } }),
      prisma.vehicle.count({ where: { dataAreaId } }),
      prisma.account.count({ where: { dataAreaId } }),
      prisma.user.findMany({
        where: { dataAreaId, isDemo: true },
        select: { email: true, role: true },
        orderBy: { email: "asc" },
      }),
    ]);
    out.push({
      code: co.code,
      name: co.name,
      isSandbox: true,
      expiresAt: co.sandboxExpiresAt,
      expired: isSandboxExpired(co),
      daysRemaining: sandboxDaysRemaining(co),
      demoUsers,
      counts: { orders, trips, clients, customers, vehicles, accounts },
    });
  }
  return out;
}

const CODE_RE = /^[A-Z][A-Z0-9]{1,9}$/;

/** An access window `days` from now, or null for a partition that never expires. */
function expiryFromDays(days?: number | null): Date | null {
  if (days == null) return null;
  return new Date(Date.now() + days * 86_400_000);
}

/**
 * Create (or ensure) a sandbox company, seed its demo baseline and issue a set of
 * demo logins. Returns the credentials — this is the only moment the password is
 * visible, so the caller must surface it.
 */
export async function provisionSandbox(
  code: string,
  name: string,
  organizationId: string,
  expiresInDays?: number | null,
  userId?: string | null,
) {
  const key = code.trim().toUpperCase();
  if (!CODE_RE.test(key)) throw new AuthError("Company code must be 2–10 upper-case letters/digits", 422);
  const existing = await prisma.company.findUnique({ where: { code: key } });
  if (existing && !existing.isSandbox) throw new AuthError(`Company ${key} already exists and is not a sandbox`, 409);
  // A sandbox belongs to the parent that provisioned it, so one customer's demo
  // area can never be reached from another's.
  if (existing && existing.organizationId !== organizationId) {
    throw new AuthError(`Sandbox ${key} belongs to another organization`, 403);
  }

  const sandboxExpiresAt = expiryFromDays(expiresInDays);
  const company = await prisma.company.upsert({
    where: { code: key },
    update: { isSandbox: true, name: name.trim() || key, sandboxExpiresAt, updatedById: userId ?? null },
    create: { organizationId, code: key, name: name.trim() || key, isSandbox: true, sandboxExpiresAt, createdById: userId ?? null },
  });
  noteCompanyChanged(company.code, company.organizationId);
  // Fresh baseline: wipe anything already there, then seed.
  await wipeSandboxData(key);
  await seedSandboxDemo(key);
  const credentials = await issueSandboxCredentials(key, organizationId);
  return { company, credentials };
}

/**
 * Reset a sandbox partition — GUARDED to sandbox companies only.
 * Demo logins are deliberately preserved so credentials already shared with a
 * prospect keep working; only the business data is rebuilt.
 */
export async function resetSandbox(code: string, organizationId: string | null) {
  const company = await requireSandboxCompany(code, organizationId);
  await wipeSandboxData(company.code);
  await seedSandboxDemo(company.code);
  await linkDemoDriver(company.code); // the sample driver row was replaced
  return company;
}

/** Change (or clear) a sandbox access window. Guarded to sandbox companies. */
export async function setSandboxExpiry(code: string, expiresInDays: number | null, organizationId: string | null, userId?: string | null) {
  const company = await requireSandboxCompany(code, organizationId);
  return prisma.company.update({
    where: { code: company.code },
    data: { sandboxExpiresAt: expiryFromDays(expiresInDays), updatedById: userId ?? null },
  });
}
