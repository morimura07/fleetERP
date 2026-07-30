import { Role } from "@prisma/client";

/**
 * Role-Based Access Control.
 *
 * Permissions are coarse-grained capabilities. Each route/action declares the
 * permission it needs; we map roles -> permissions here so the policy lives in
 * one place.
 */
export type Permission =
  | "dashboard:view"
  | "driver:read"
  | "driver:write"
  | "vehicle:read"
  | "vehicle:write"
  | "client:read"
  | "client:write"
  | "job:read"
  | "job:write"
  | "dispatch:read"
  | "dispatch:write"
  | "report:read"
  | "report:write" // create/edit a daily report
  | "report:review" // dispatcher/admin confirming reports
  | "payment:read"
  | "payment:write"
  | "account:read" // chart of accounts
  | "account:write"
  | "ledger:read" // view journal entries
  | "ledger:write" // create/edit DRAFT entries
  | "ledger:post" // post / reverse entries
  | "order:read"
  | "order:write"
  | "order:invoice" // post AR invoice to the ledger
  | "trip:read"
  | "trip:write"
  | "vendor:read"
  | "vendor:write"
  | "payable:read"
  | "payable:write" // create AP bills
  | "payable:post" // post bills & payments to the ledger
  | "customer:read"
  | "customer:write"
  | "receivable:read"
  | "receivable:write" // create AR invoices
  | "receivable:post" // post invoices & receipts to the ledger
  | "tax:read" // VAT/WHT return prep
  | "tax:write"
  | "collection:read" // AR aging / collections
  | "collection:write" // dunning, disputes, promise-to-pay, contacts (M7)
  | "collection:approve" // write off bad debt (posts to the ledger)
  | "bank:read" // cash & bank accounts (M4)
  | "bank:write" // maintain bank/mobile-money accounts
  | "bank:disburse" // post driver disbursements to the ledger
  | "budget:read" // budgets & budget control (M3)
  | "budget:write"
  | "inventory:read" // stock items & movements (M14)
  | "inventory:write"
  | "warehouse:read" // warehouses & stock balances (M18)
  | "warehouse:write"
  | "procurement:read" // purchase orders & goods receipt (M15)
  | "procurement:write"
  | "procurement:approve" // approve POs & 3-way match
  | "payroll:read" // employees & pay runs (M9)
  | "payroll:write"
  | "payroll:approve" // approve & post pay runs
  | "expense:read" // expense claims / cash sheets (M23)
  | "expense:write"
  | "expense:approve" // approve & post claims
  | "asset:read" // fixed asset register (M20)
  | "asset:write"
  | "asset:approve" // run depreciation & dispose assets
  | "service:read" // workshop service orders (M22)
  | "service:write"
  | "service:approve" // complete & post service orders
  | "hr:read" // HR: contracts, leave, documents (M24)
  | "hr:write"
  | "hr:approve" // approve leave & activate contracts
  | "attendance:read" // time & attendance (M26)
  | "attendance:write"
  | "attendance:approve" // approve timesheets (feed payroll)
  | "fx:read" // exchange rates (M8 multi-currency)
  | "fx:write"
  | "consolidation:read" // subsidiary→parent mapping & rollup (M5)
  | "consolidation:run"
  | "period:read" // fiscal calendar / period-close (M34)
  | "period:manage"
  | "compliance:read" // vehicle & driver document-expiry dashboard (M11)
  | "sales:read" // sales & marketing: leads, quotes (M27)
  | "sales:write"
  | "sales:convert" // convert an accepted quote into a freight order
  | "project:read" // project / contract P&L (M29)
  | "project:write"
  | "planning:read" // master planning: demand forecasts & capacity plan (M33)
  | "planning:write"
  | "pos:read" // retail / point-of-sale (M28)
  | "pos:write"
  | "kpi:read" // operational KPI capture: dock events, damage reports, feedback (Tier C)
  | "kpi:write"
  | "waypoint:read" // GPS waypoint registry (M30 Common)
  | "waypoint:write"
  | "tracking:read" // live vehicle positions (M12 / §5)
  | "export:run"
  | "activity:read"
  | "user:manage"
  | "company:manage"; // legal-entity / company registry (M34)

export const ALL: Permission[] = [
  "dashboard:view",
  "driver:read",
  "driver:write",
  "vehicle:read",
  "vehicle:write",
  "client:read",
  "client:write",
  "job:read",
  "job:write",
  "dispatch:read",
  "dispatch:write",
  "report:read",
  "report:write",
  "report:review",
  "payment:read",
  "payment:write",
  "account:read",
  "account:write",
  "ledger:read",
  "ledger:write",
  "ledger:post",
  "order:read",
  "order:write",
  "order:invoice",
  "trip:read",
  "trip:write",
  "vendor:read",
  "vendor:write",
  "payable:read",
  "payable:write",
  "payable:post",
  "customer:read",
  "customer:write",
  "receivable:read",
  "receivable:write",
  "receivable:post",
  "tax:read",
  "tax:write",
  "collection:read",
  "collection:write",
  "collection:approve",
  "bank:read",
  "bank:write",
  "bank:disburse",
  "budget:read",
  "budget:write",
  "inventory:read",
  "inventory:write",
  "warehouse:read",
  "warehouse:write",
  "procurement:read",
  "procurement:write",
  "procurement:approve",
  "payroll:read",
  "payroll:write",
  "payroll:approve",
  "expense:read",
  "expense:write",
  "expense:approve",
  "asset:read",
  "asset:write",
  "asset:approve",
  "service:read",
  "service:write",
  "service:approve",
  "hr:read",
  "hr:write",
  "hr:approve",
  "attendance:read",
  "attendance:write",
  "attendance:approve",
  "fx:read",
  "fx:write",
  "consolidation:read",
  "consolidation:run",
  "period:read",
  "period:manage",
  "compliance:read",
  "sales:read",
  "sales:write",
  "sales:convert",
  "project:read",
  "project:write",
  "planning:read",
  "planning:write",
  "pos:read",
  "pos:write",
  "kpi:read",
  "kpi:write",
  "waypoint:read",
  "waypoint:write",
  "tracking:read",
  "export:run",
  "activity:read",
  "user:manage",
  "company:manage",
];

/**
 * The built-in defaults for the 5 system roles. This is the seed source of truth
 * for the `rbac_*` tables; at runtime the effective grants are read from
 * `runtimePermissions`, which is hydrated from the DB (so admins can change them)
 * and falls back to these defaults until hydration runs.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  DISPATCHER: [
    "dashboard:view",
    "driver:read",
    "vehicle:read",
    "client:read",
    "client:write",
    "job:read",
    "job:write",
    "dispatch:read",
    "dispatch:write",
    "report:read",
    "report:review",
    "payment:read",
    "account:read",
    "ledger:read",
    "order:read",
    "order:write",
    "trip:read",
    "trip:write",
    "vendor:read",
    "payable:read",
    "customer:read",
    "receivable:read",
    "collection:read",
    "bank:read",
    "budget:read",
    "inventory:read",
    "inventory:write",
    "warehouse:read",
    "warehouse:write",
    "procurement:read",
    "procurement:write",
    "expense:read",
    "expense:write",
    "service:read",
    "service:write",
    "service:approve",
    "attendance:read",
    "attendance:write",
    "fx:read",
    "compliance:read",
    "sales:read",
    "sales:write",
    "sales:convert",
    "project:read",
    "project:write",
    "planning:read",
    "planning:write",
    "pos:read",
    "pos:write",
    "kpi:read",
    "kpi:write",
    "waypoint:read",
    "waypoint:write",
    "tracking:read",
    "export:run",
  ],
  // Finance Controller — accounting authority, read-only on operations.
  FINANCE: [
    "dashboard:view",
    "client:read",
    "driver:read",
    "vehicle:read",
    "order:read",
    "order:invoice", // AR: post freight invoices to the ledger
    "trip:read",
    "account:read",
    "account:write", // maintain the chart of accounts
    "ledger:read",
    "ledger:write",
    "ledger:post", // post & reverse journal entries
    "payment:read",
    "payment:write", // finalize driver payroll
    "vendor:read",
    "vendor:write",
    "payable:read",
    "payable:write",
    "payable:post",
    "customer:read",
    "customer:write",
    "receivable:read",
    "receivable:write",
    "receivable:post",
    "tax:read",
    "tax:write",
    "collection:read",
    "collection:write",
    "collection:approve",
    "bank:read",
    "bank:write",
    "bank:disburse",
    "budget:read",
    "budget:write",
    "inventory:read",
    "warehouse:read",
    "procurement:read",
    "procurement:approve",
    "payroll:read",
    "payroll:write",
    "payroll:approve",
    "expense:read",
    "expense:write",
    "expense:approve",
    "asset:read",
    "asset:write",
    "asset:approve",
    "service:read",
    "service:approve",
    "hr:read",
    "hr:write",
    "hr:approve",
    "attendance:read",
    "attendance:write",
    "attendance:approve",
    "fx:read",
    "fx:write",
    "consolidation:read",
    "consolidation:run",
    "period:read",
    "period:manage",
    "compliance:read",
    "sales:read",
    "project:read",
    "project:write",
    "planning:read",
    "pos:read",
    "kpi:read",
    "waypoint:read",
    "tracking:read",
    "report:read",
    "activity:read",
    "export:run",
  ],
  DRIVER: [
    "job:read", // own jobs only — enforced at the query layer
    "report:read",
    "report:write",
  ],
  STAFF: [
    "dashboard:view",
    "driver:read",
    "vehicle:read",
    "client:read",
    "job:read",
    "dispatch:read",
    "report:read",
    "payment:read",
    "account:read",
    "ledger:read",
    "order:read",
    "trip:read",
    "vendor:read",
    "payable:read",
    "customer:read",
    "receivable:read",
    "tax:read",
    "collection:read",
    "bank:read",
    "budget:read",
    "inventory:read",
    "warehouse:read",
    "procurement:read",
    "payroll:read",
    "expense:read",
    "fx:read",
    "consolidation:read",
    "period:read",
    "compliance:read",
    "sales:read",
    "project:read",
    "planning:read",
    "pos:read",
    "kpi:read",
    "waypoint:read",
    "tracking:read",
  ],
};

/**
 * Effective role → permission grants, keyed by role *key* (system role name like
 * "ADMIN", or a custom role's key). Seeded from the defaults and overwritten by
 * `hydrateRbac()` from the DB, so admin edits take effect without a code change.
 * Kept as a synchronous in-memory map so `can()` stays sync — no route touches.
 */
const runtimePermissions = new Map<string, Set<string>>(
  Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, perms]) => [role, new Set<string>(perms)]),
);

/** Replace the entire runtime grant map from DB rows (called at startup / after edits). */
export function hydrateRbac(roleGrants: { roleKey: string; permissions: string[] }[]) {
  runtimePermissions.clear();
  for (const { roleKey, permissions } of roleGrants) {
    runtimePermissions.set(roleKey, new Set(permissions));
  }
}

/** Update (or add) a single role's grants in the runtime map. */
export function setRuntimeRole(roleKey: string, permissions: string[]) {
  runtimePermissions.set(roleKey, new Set(permissions));
}

/** Remove a role from the runtime map (custom-role deletion). */
export function removeRuntimeRole(roleKey: string) {
  runtimePermissions.delete(roleKey);
}

/**
 * Does a user with this role key have the permission? `roleKey` is the custom
 * role key when the user has one, else the system role name. Falls back to the
 * built-in defaults if the key isn't in the runtime map (e.g. before hydration).
 */
export function can(roleKey: string | undefined | null, permission: Permission): boolean {
  if (!roleKey) return false;
  const grants = runtimePermissions.get(roleKey);
  if (grants) return grants.has(permission);
  // Fallback: unknown key that matches a system role default.
  const def = DEFAULT_ROLE_PERMISSIONS[roleKey as Role];
  return def ? def.includes(permission) : false;
}

export function permissionsFor(roleKey: string): Permission[] {
  const grants = runtimePermissions.get(roleKey);
  if (grants) return [...grants] as Permission[];
  return DEFAULT_ROLE_PERMISSIONS[roleKey as Role] ?? [];
}

/** Route prefixes each role is allowed to enter (used by middleware). */
export const ROUTE_GUARDS: { prefix: string; permission: Permission }[] = [
  { prefix: "/dashboard", permission: "dashboard:view" },
  { prefix: "/drivers", permission: "driver:read" },
  { prefix: "/vehicles", permission: "vehicle:read" },
  { prefix: "/clients", permission: "client:read" },
  { prefix: "/jobs", permission: "job:read" },
  { prefix: "/dispatch", permission: "dispatch:read" },
  { prefix: "/reports", permission: "report:read" },
  { prefix: "/payments", permission: "payment:read" },
  { prefix: "/accounts", permission: "account:read" },
  { prefix: "/ledger", permission: "ledger:read" },
  { prefix: "/orders", permission: "order:read" },
  { prefix: "/trips", permission: "trip:read" },
  { prefix: "/vendors", permission: "vendor:read" },
  { prefix: "/payables", permission: "payable:read" },
  { prefix: "/customers", permission: "customer:read" },
  { prefix: "/receivables", permission: "receivable:read" },
  { prefix: "/tax", permission: "tax:read" },
  { prefix: "/collections", permission: "collection:read" },
  { prefix: "/bank", permission: "bank:read" },
  { prefix: "/budgets", permission: "budget:read" },
  { prefix: "/inventory", permission: "inventory:read" },
  { prefix: "/warehouses", permission: "warehouse:read" },
  { prefix: "/procurement", permission: "procurement:read" },
  { prefix: "/payroll", permission: "payroll:read" },
  { prefix: "/expenses", permission: "expense:read" },
  { prefix: "/fx", permission: "fx:read" },
  { prefix: "/consolidation", permission: "consolidation:read" },
  { prefix: "/compliance", permission: "compliance:read" },
  { prefix: "/waypoints", permission: "waypoint:read" },
  { prefix: "/tracking", permission: "tracking:read" },
  { prefix: "/activity", permission: "activity:read" },
  { prefix: "/users", permission: "user:manage" },
  { prefix: "/companies", permission: "company:manage" },
];
