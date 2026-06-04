import { ROLES, type RoleKey } from './roles.js';

/**
 * The 36 functional modules from the SRS §2, preserving the document's grouping.
 * `key` is a stable slug used for routing (/dashboard/<key>) and permission checks.
 * `roles` lists which RBAC roles may access the module (SYSTEM_ADMIN always implied).
 */
export interface ModuleDef {
  id: number;
  key: string;
  name: string;
  /** Lucide icon name used by the web nav. */
  icon: string;
  roles: RoleKey[];
}

export interface ModuleGroup {
  key: string;
  name: string;
  modules: ModuleDef[];
}

const { OPERATIONS_PLANNER, FINANCE_CONTROLLER, WORKSHOP_MANAGER } = ROLES;

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    key: 'financial',
    name: 'Core Financial',
    modules: [
      { id: 1, key: 'accounts-payable', name: 'Accounts Payable', icon: 'ReceiptText', roles: [FINANCE_CONTROLLER] },
      { id: 2, key: 'accounts-receivable', name: 'Accounts Receivable', icon: 'HandCoins', roles: [FINANCE_CONTROLLER] },
      { id: 3, key: 'budgeting', name: 'Budgeting', icon: 'PiggyBank', roles: [FINANCE_CONTROLLER] },
      { id: 4, key: 'cash-bank', name: 'Cash & Bank Management', icon: 'Landmark', roles: [FINANCE_CONTROLLER] },
      { id: 5, key: 'consolidations', name: 'Consolidations', icon: 'Combine', roles: [FINANCE_CONTROLLER] },
      { id: 6, key: 'cost-accounting', name: 'Cost Accounting', icon: 'Calculator', roles: [FINANCE_CONTROLLER] },
      { id: 7, key: 'credit-collections', name: 'Credit & Collections', icon: 'AlarmClock', roles: [FINANCE_CONTROLLER] },
      { id: 8, key: 'general-ledger', name: 'General Ledger', icon: 'BookOpen', roles: [FINANCE_CONTROLLER] },
      { id: 9, key: 'payroll', name: 'Payroll', icon: 'BadgeDollarSign', roles: [FINANCE_CONTROLLER] },
      { id: 10, key: 'tax', name: 'Tax', icon: 'Percent', roles: [FINANCE_CONTROLLER] },
    ],
  },
  {
    key: 'operations',
    name: 'Operations & Logistics',
    modules: [
      { id: 11, key: 'fleet-management', name: 'Fleet Management', icon: 'Truck', roles: [OPERATIONS_PLANNER] },
      { id: 12, key: 'transportation-management', name: 'Transportation Management', icon: 'Route', roles: [OPERATIONS_PLANNER] },
    ],
  },
  {
    key: 'inventory',
    name: 'Inventory, Warehouse & Supply Chain',
    modules: [
      { id: 13, key: 'cost-management', name: 'Cost Management', icon: 'Coins', roles: [WORKSHOP_MANAGER] },
      { id: 14, key: 'inventory-management', name: 'Inventory Management', icon: 'Boxes', roles: [WORKSHOP_MANAGER] },
      { id: 15, key: 'procurement-sourcing', name: 'Procurement & Sourcing', icon: 'ShoppingCart', roles: [WORKSHOP_MANAGER] },
      { id: 16, key: 'product-information', name: 'Product Information Mgmt', icon: 'Tags', roles: [WORKSHOP_MANAGER] },
      { id: 17, key: 'vendor-collaboration', name: 'Vendor Collaboration', icon: 'Handshake', roles: [WORKSHOP_MANAGER] },
      { id: 18, key: 'warehouse-management', name: 'Warehouse Management', icon: 'Warehouse', roles: [WORKSHOP_MANAGER] },
    ],
  },
  {
    key: 'maintenance',
    name: 'Asset Maintenance & Workshop',
    modules: [
      { id: 19, key: 'asset-management', name: 'Asset Management', icon: 'Wrench', roles: [WORKSHOP_MANAGER] },
      { id: 20, key: 'fixed-assets', name: 'Fixed Assets', icon: 'Building2', roles: [WORKSHOP_MANAGER, FINANCE_CONTROLLER] },
      { id: 21, key: 'production-control', name: 'Production Control', icon: 'Cog', roles: [WORKSHOP_MANAGER] },
      { id: 22, key: 'service-management', name: 'Service Management', icon: 'Headset', roles: [WORKSHOP_MANAGER] },
    ],
  },
  {
    key: 'hr',
    name: 'Human Capital & Workspace',
    modules: [
      { id: 23, key: 'expense-management', name: 'Expense Management', icon: 'Receipt', roles: [FINANCE_CONTROLLER, OPERATIONS_PLANNER] },
      { id: 24, key: 'human-resources', name: 'Human Resources', icon: 'Users', roles: [] },
      { id: 25, key: 'questionnaire', name: 'Questionnaire', icon: 'ClipboardList', roles: [OPERATIONS_PLANNER] },
      { id: 26, key: 'time-attendance', name: 'Time & Attendance', icon: 'Clock', roles: [WORKSHOP_MANAGER] },
    ],
  },
  {
    key: 'commercial',
    name: 'Commercial, Retail & Projects',
    modules: [
      { id: 27, key: 'project-management', name: 'Project Mgmt & Accounting', icon: 'FolderKanban', roles: [FINANCE_CONTROLLER] },
      { id: 28, key: 'retail-commerce', name: 'Retail & Commerce', icon: 'Store', roles: [] },
      { id: 29, key: 'sales-marketing', name: 'Sales & Marketing', icon: 'Megaphone', roles: [OPERATIONS_PLANNER] },
    ],
  },
  {
    key: 'system',
    name: 'Shared Frameworks & System',
    modules: [
      { id: 30, key: 'common', name: 'Common', icon: 'Globe', roles: [OPERATIONS_PLANNER] },
      { id: 31, key: 'audit-workbench', name: 'Audit Workbench', icon: 'ShieldCheck', roles: [] },
      { id: 32, key: 'demo-data', name: 'Demo Data', icon: 'FlaskConical', roles: [] },
      { id: 33, key: 'master-planning', name: 'Master Planning', icon: 'CalendarRange', roles: [OPERATIONS_PLANNER] },
      { id: 34, key: 'organization-admin', name: 'Organization Administration', icon: 'Network', roles: [] },
      { id: 35, key: 'project-oaktree', name: 'Project Oaktree', icon: 'TreePine', roles: [] },
      { id: 36, key: 'system-administration', name: 'System Administration', icon: 'Settings', roles: [] },
    ],
  },
];

/** Flat list of all 36 modules. */
export const ALL_MODULES: ModuleDef[] = MODULE_GROUPS.flatMap((g) => g.modules);

/** Does the given role have access to the module? SYSTEM_ADMIN sees everything. */
export function canAccessModule(role: RoleKey, mod: ModuleDef): boolean {
  if (role === ROLES.SYSTEM_ADMIN) return true;
  return mod.roles.includes(role);
}

/** Module groups filtered to those a role can see (empty groups removed). */
export function moduleGroupsForRole(role: RoleKey): ModuleGroup[] {
  return MODULE_GROUPS.map((g) => ({
    ...g,
    modules: g.modules.filter((m) => canAccessModule(role, m)),
  })).filter((g) => g.modules.length > 0);
}
