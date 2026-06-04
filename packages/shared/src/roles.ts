/**
 * RBAC roles — SRS §4.1 Role-Based Access Controls.
 * These role keys are the source of truth shared between API guards and web nav.
 */
export const ROLES = {
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  OPERATIONS_PLANNER: 'OPERATIONS_PLANNER',
  FINANCE_CONTROLLER: 'FINANCE_CONTROLLER',
  WORKSHOP_MANAGER: 'WORKSHOP_MANAGER',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<RoleKey, string> = {
  SYSTEM_ADMIN: 'System Administrator',
  OPERATIONS_PLANNER: 'Operations Planner',
  FINANCE_CONTROLLER: 'Finance Controller',
  WORKSHOP_MANAGER: 'Workshop Manager',
};
