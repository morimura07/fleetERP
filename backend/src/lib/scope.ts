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
 * A `where` fragment that scopes a partitioned model to the user's entity.
 * Returns `{}` for ADMIN (no restriction), `{ dataAreaId }` otherwise.
 * Spread it into any `where` clause:
 *   where: { ...areaScope(user), status: "POSTED" }
 */
export function areaScope(user: AuthUser): { dataAreaId?: string } {
  return isCrossEntity(user) ? {} : { dataAreaId: user.dataAreaId };
}

/**
 * The dataAreaId a new record should be written with. Non-admins always create
 * in their own entity; admins may pass an explicit target (falling back to
 * their own). Prevents a scoped user from planting rows in another entity.
 */
export function areaForWrite(user: AuthUser, requested?: string): string {
  if (isCrossEntity(user)) return requested ?? user.dataAreaId;
  return user.dataAreaId;
}

/**
 * Guard a single fetched record: throw 404 if it belongs to another entity and
 * the user isn't cross-entity. Use after a findUnique on a partitioned model so
 * a scoped user can't read a sibling entity's row by guessing its id.
 */
export function assertSameArea(user: AuthUser, row: { dataAreaId: string } | null): void {
  if (!row) throw new AuthError("Not found", 404);
  if (!isCrossEntity(user) && row.dataAreaId !== user.dataAreaId) {
    throw new AuthError("Not found", 404); // 404 (not 403) to avoid leaking existence
  }
}
