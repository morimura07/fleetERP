/**
 * Role-Based Access Control — frontend copy.
 *
 * The backend owns the authoritative RBAC map (it gates every API call); this
 * client-side copy drives nav rendering and the middleware route guard. The two
 * must be kept in sync. Roles are a local string-literal union (the frontend has
 * no Prisma dependency).
 */
export type Role = "SUPER_ADMIN" | "ADMIN" | "DISPATCHER" | "FINANCE" | "DRIVER" | "STAFF";

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
  | "report:write"
  | "report:review"
  | "payment:read"
  | "payment:write"
  | "account:read"
  | "account:write"
  | "ledger:read"
  | "ledger:write"
  | "ledger:post"
  | "order:read"
  | "order:write"
  | "order:invoice"
  | "trip:read"
  | "trip:write"
  | "vendor:read"
  | "vendor:write"
  | "payable:read"
  | "payable:write"
  | "payable:post"
  | "customer:read"
  | "customer:write"
  | "receivable:read"
  | "receivable:write"
  | "receivable:post"
  | "tax:read"
  | "tax:write"
  | "collection:read"
  | "collection:write"
  | "collection:approve"
  | "bank:read"
  | "bank:write"
  | "bank:disburse"
  | "budget:read"
  | "budget:write"
  | "inventory:read"
  | "inventory:write"
  | "warehouse:read"
  | "warehouse:write"
  | "procurement:read"
  | "procurement:write"
  | "procurement:approve"
  | "payroll:read"
  | "payroll:write"
  | "payroll:approve"
  | "expense:read"
  | "expense:write"
  | "expense:approve"
  | "asset:read"
  | "asset:write"
  | "asset:approve"
  | "service:read"
  | "service:write"
  | "service:approve"
  | "hr:read"
  | "hr:write"
  | "hr:approve"
  | "attendance:read"
  | "attendance:write"
  | "attendance:approve"
  | "fx:read"
  | "fx:write"
  | "consolidation:read"
  | "consolidation:run"
  | "period:read"
  | "period:manage"
  | "compliance:read"
  | "sales:read"
  | "sales:write"
  | "sales:convert"
  | "project:read"
  | "project:write"
  | "planning:read"
  | "planning:write"
  | "pos:read"
  | "pos:write"
  | "kpi:read"
  | "kpi:write"
  | "waypoint:read"
  | "waypoint:write"
  | "tracking:read"
  | "export:run"
  | "activity:read"
  | "user:manage"
  | "company:manage"
  | "organization:manage";

const ALL: Permission[] = [
  "dashboard:view",
  "driver:read", "driver:write",
  "vehicle:read", "vehicle:write",
  "client:read", "client:write",
  "job:read", "job:write",
  "dispatch:read", "dispatch:write",
  "report:read", "report:write", "report:review",
  "payment:read", "payment:write",
  "account:read", "account:write",
  "ledger:read", "ledger:write", "ledger:post",
  "order:read", "order:write", "order:invoice",
  "trip:read", "trip:write",
  "vendor:read", "vendor:write",
  "payable:read", "payable:write", "payable:post",
  "customer:read", "customer:write",
  "receivable:read", "receivable:write", "receivable:post",
  "tax:read", "tax:write",
  "collection:read", "collection:write", "collection:approve",
  "bank:read", "bank:write", "bank:disburse",
  "budget:read", "budget:write",
  "inventory:read", "inventory:write",
  "warehouse:read", "warehouse:write",
  "procurement:read", "procurement:write", "procurement:approve",
  "payroll:read", "payroll:write", "payroll:approve",
  "expense:read", "expense:write", "expense:approve",
  "asset:read", "asset:write", "asset:approve",
  "service:read", "service:write", "service:approve",
  "hr:read", "hr:write", "hr:approve",
  "attendance:read", "attendance:write", "attendance:approve",
  "fx:read", "fx:write",
  "consolidation:read", "consolidation:run",
  "period:read", "period:manage",
  "compliance:read",
  "sales:read", "sales:write", "sales:convert",
  "project:read", "project:write",
  "planning:read", "planning:write",
  "pos:read", "pos:write",
  "kpi:read", "kpi:write",
  "waypoint:read", "waypoint:write",
  "tracking:read",
  "export:run",
  "activity:read",
  "user:manage",
  "company:manage",
  "organization:manage",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL.filter((p) => p !== "organization:manage"),
  DISPATCHER: [
    "dashboard:view",
    "driver:read", "vehicle:read",
    "client:read", "client:write",
    "job:read", "job:write",
    "dispatch:read", "dispatch:write",
    "report:read", "report:review",
    "payment:read", "account:read", "ledger:read",
    "order:read", "order:write",
    "trip:read", "trip:write",
    "vendor:read", "payable:read", "customer:read", "receivable:read",
    "collection:read", "bank:read", "budget:read", "inventory:read", "inventory:write", "warehouse:read", "warehouse:write", "procurement:read", "procurement:write", "expense:read", "expense:write", "service:read", "service:write", "service:approve", "attendance:read", "attendance:write", "fx:read",
    "compliance:read", "sales:read", "sales:write", "sales:convert", "project:read", "project:write", "planning:read", "planning:write", "pos:read", "pos:write", "kpi:read", "kpi:write", "waypoint:read", "waypoint:write", "tracking:read",
    "export:run",
  ],
  FINANCE: [
    "dashboard:view",
    "client:read", "driver:read", "vehicle:read",
    "order:read", "order:invoice", "trip:read",
    "account:read", "account:write",
    "ledger:read", "ledger:write", "ledger:post",
    "payment:read", "payment:write",
    "vendor:read", "vendor:write",
    "payable:read", "payable:write", "payable:post",
    "customer:read", "customer:write",
    "receivable:read", "receivable:write", "receivable:post",
    "tax:read", "tax:write", "collection:read", "collection:write", "collection:approve",
    "bank:read", "bank:write", "bank:disburse",
    "budget:read", "budget:write",
    "inventory:read", "warehouse:read", "procurement:read", "procurement:approve",
    "payroll:read", "payroll:write", "payroll:approve",
    "expense:read", "expense:write", "expense:approve",
    "asset:read", "asset:write", "asset:approve",
    "service:read", "service:approve",
    "hr:read", "hr:write", "hr:approve",
    "attendance:read", "attendance:write", "attendance:approve",
    "fx:read", "fx:write",
    "consolidation:read", "consolidation:run",
    "period:read", "period:manage",
    "compliance:read", "sales:read", "project:read", "project:write", "planning:read", "pos:read", "kpi:read", "waypoint:read", "tracking:read",
    "report:read", "activity:read", "export:run",
  ],
  DRIVER: ["job:read", "report:read", "report:write"],
  STAFF: [
    "dashboard:view",
    "driver:read", "vehicle:read", "client:read", "job:read", "dispatch:read",
    "report:read", "payment:read", "account:read", "ledger:read",
    "order:read", "trip:read", "vendor:read", "payable:read",
    "customer:read", "receivable:read", "tax:read", "collection:read",
    "bank:read", "budget:read", "inventory:read", "warehouse:read", "procurement:read", "payroll:read", "expense:read", "fx:read", "consolidation:read",
    "period:read",
    "compliance:read", "sales:read", "project:read", "planning:read", "pos:read", "kpi:read", "waypoint:read", "tracking:read",
  ],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Platform Administrator",
  ADMIN: "Administrator",
  DISPATCHER: "Operations Planner",
  FINANCE: "Finance Controller",
  DRIVER: "Driver",
  STAFF: "Staff",
};

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
  { prefix: "/product-attributes", permission: "inventory:read" },
  { prefix: "/units", permission: "inventory:read" },
  { prefix: "/cost-variance", permission: "inventory:read" },
  { prefix: "/warehouses", permission: "warehouse:read" },
  { prefix: "/procurement", permission: "procurement:read" },
  { prefix: "/requisitions", permission: "procurement:read" },
  { prefix: "/payroll", permission: "payroll:read" },
  { prefix: "/expenses", permission: "expense:read" },
  { prefix: "/assets", permission: "asset:read" },
  { prefix: "/service", permission: "service:read" },
  { prefix: "/hr", permission: "hr:read" },
  { prefix: "/attendance", permission: "attendance:read" },
  { prefix: "/fx", permission: "fx:read" },
  { prefix: "/consolidation", permission: "consolidation:read" },
  { prefix: "/periods", permission: "period:read" },
  { prefix: "/corridor-pnl", permission: "dashboard:view" },
  { prefix: "/compliance", permission: "compliance:read" },
  { prefix: "/leads", permission: "sales:read" },
  { prefix: "/quotes", permission: "sales:read" },
  { prefix: "/projects", permission: "project:read" },
  { prefix: "/planning", permission: "planning:read" },
  { prefix: "/pos", permission: "pos:read" },
  { prefix: "/dock-events", permission: "kpi:read" },
  { prefix: "/damage-reports", permission: "kpi:read" },
  { prefix: "/imports", permission: "vehicle:write" },
  { prefix: "/feedback", permission: "kpi:read" },
  { prefix: "/waypoints", permission: "waypoint:read" },
  { prefix: "/tracking", permission: "tracking:read" },
  { prefix: "/activity", permission: "activity:read" },
  { prefix: "/users", permission: "user:manage" },
  { prefix: "/roles", permission: "user:manage" },
  { prefix: "/organizations", permission: "organization:manage" },
  { prefix: "/companies", permission: "company:manage" },
  { prefix: "/sandbox", permission: "company:manage" },
];
