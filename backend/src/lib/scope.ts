import type { AuthUser } from "@backend/lib/auth";
import { AuthError } from "@backend/lib/errors";
import { companiesInOrganization } from "@backend/lib/organization";

/**
 * Multi-tenant data isolation (PRD §6.2).
 *
 * Two levels:
 *   Organization  — the tenant boundary (parent company). Separate customers.
 *   Company       — a legal entity inside it, carried on every record as `dataAreaId`.
 *
 * Reach by role:
 *   SUPER_ADMIN — every organization (platform operator)
 *   ADMIN       — every company inside their OWN organization
 *   everyone else — their own company only
 *
 * These helpers are the single place that rule is expressed, so every query
 * enforces it identically. They are synchronous by design; the company →
 * organization map is held in memory (`lib/organization.ts`).
 */

/** Platform operator: the only role that reads across organizations. */
export function isPlatformAdmin(user: AuthUser): boolean {
  return user.role === "SUPER_ADMIN";
}

/** Sees more than one company — an org admin or the platform operator. */
export function isCrossEntity(user: AuthUser): boolean {
  return isPlatformAdmin(user) || user.role === "ADMIN";
}

/**
 * The company switcher: a cross-entity user may set an "active company" per
 * request via the X-Data-Area header to focus the view / choose where new
 * records land. Non-admins can never override their own entity, so the header
 * is ignored for them. `activeArea` is stamped onto the AuthUser by requireAuth.
 */
export function activeArea(user: AuthUser): string | undefined {
  return isCrossEntity(user) ? user.activeArea : undefined;
}

/**
 * Every company code this user may reach. Null means "unrestricted" and is only
 * ever returned for the platform operator.
 */
export function reachableAreas(user: AuthUser): string[] | null {
  if (isPlatformAdmin(user)) return null;
  if (user.role === "ADMIN" && user.organizationId) {
    const codes = companiesInOrganization(user.organizationId);
    // An org with no known companies must still include the admin's own entity,
    // otherwise a hydration gap would silently lock them out of their own data.
    return codes.length > 0 ? codes : [user.dataAreaId];
  }
  return [user.dataAreaId];
}

/** True when the user is allowed to read/write records in `area`. */
export function canReachArea(user: AuthUser, area: string): boolean {
  const reachable = reachableAreas(user);
  return reachable === null || reachable.includes(area);
}

/**
 * A `where` fragment scoping a partitioned model to what the caller may reach.
 * - Non-admin: exactly their own entity.
 * - ADMIN with an active company selected: that company, provided it is inside
 *   their organization (a spoofed header falls back to their own entity).
 * - ADMIN with none selected: every company in their organization.
 * - SUPER_ADMIN with none selected: `{}` (all organizations).
 */
export function areaScope(user: AuthUser): { dataAreaId?: string | { in: string[] } } {
  const selected = activeArea(user);
  if (selected) {
    // Never let the header reach outside the tenant.
    return { dataAreaId: canReachArea(user, selected) ? selected : user.dataAreaId };
  }
  const reachable = reachableAreas(user);
  if (reachable === null) return {};
  return reachable.length === 1 ? { dataAreaId: reachable[0] } : { dataAreaId: { in: reachable } };
}

/**
 * The dataAreaId a new record should be written with.
 * - Non-admin: always their own entity (a spoofed target is ignored).
 * - Cross-entity: the explicit target, else the active company, else their own —
 *   but only if it is inside their organization.
 */
export function areaForWrite(user: AuthUser, requested?: string): string {
  if (!isCrossEntity(user)) return user.dataAreaId;
  const target = requested ?? activeArea(user) ?? user.dataAreaId;
  return canReachArea(user, target) ? target : user.dataAreaId;
}

/**
 * Guard a single fetched record: throw 404 if it sits outside what the caller
 * may reach. Use after a findUnique on a partitioned model so a scoped user
 * can't read another entity's row by guessing its id.
 */
export function assertSameArea<T extends { dataAreaId: string }>(
  user: AuthUser,
  row: T | null,
): asserts row is T {
  if (!row) throw new AuthError("Not found", 404);
  if (!canReachArea(user, row.dataAreaId)) {
    throw new AuthError("Not found", 404); // 404 (not 403) to avoid leaking existence
  }
}
