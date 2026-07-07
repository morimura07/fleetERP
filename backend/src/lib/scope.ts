import type { AuthUser } from "@backend/lib/auth";
import { AuthError } from "@backend/lib/errors";

/**
 * Multi-company data isolation (PRD §6.2).
 *
 * Records on partitioned models carry a `dataAreaId` (legal entity). A user may
 * only see rows in their own entity — except ADMIN, who is cross-entity.
 * These helpers centralize that rule so every query enforces it the same way.
 */

/** True if the user can see across all legal entities. */
export function isCrossEntity(user: AuthUser): boolean {
  return user.role === "ADMIN";
}

/**
 * The company switcher: an ADMIN may set an "active company" per request via the
 * X-Data-Area header to focus the cross-entity view / choose where new records
 * land. Non-admins can never override their own entity, so the header is ignored
 * for them. `activeArea` is stamped onto the AuthUser by requireAuth.
 */
export function activeArea(user: AuthUser): string | undefined {
  return isCrossEntity(user) ? user.activeArea : undefined;
}

/**
 * A `where` fragment that scopes a partitioned model to the caller's entity.
 * - Non-admin: always their own entity.
 * - ADMIN with an active company selected: that company.
 * - ADMIN with none selected: `{}` (all entities).
 */
export function areaScope(user: AuthUser): { dataAreaId?: string } {
  if (!isCrossEntity(user)) return { dataAreaId: user.dataAreaId };
  const a = activeArea(user);
  return a ? { dataAreaId: a } : {};
}

/**
 * The dataAreaId a new record should be written with.
 * - Non-admin: always their own entity (a spoofed target is ignored).
 * - ADMIN: the explicit target, else the active company, else their own.
 */
export function areaForWrite(user: AuthUser, requested?: string): string {
  if (isCrossEntity(user)) return requested ?? activeArea(user) ?? user.dataAreaId;
  return user.dataAreaId;
}

/**
 * Guard a single fetched record: throw 404 if it belongs to another entity and
 * the user isn't cross-entity. Use after a findUnique on a partitioned model so
 * a scoped user can't read a sibling entity's row by guessing its id.
 */
export function assertSameArea<T extends { dataAreaId: string }>(
  user: AuthUser,
  row: T | null,
): asserts row is T {
  if (!row) throw new AuthError("Not found", 404);
  if (!isCrossEntity(user) && row.dataAreaId !== user.dataAreaId) {
    throw new AuthError("Not found", 404); // 404 (not 403) to avoid leaking existence
  }
}
