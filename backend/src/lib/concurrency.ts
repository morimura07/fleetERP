import { AuthError } from "@backend/lib/errors";

/**
 * Optimistic-concurrency + audit helper (PRD §7.1).
 *
 * Every editable record carries a `version` counter. An update must supply the
 * version the client last read; the guard only writes if it still matches, then
 * bumps it. A mismatch means someone else changed the row in the meantime —
 * we throw 409 so the caller can prompt a reload instead of silently clobbering.
 *
 * `updatedById` is stamped from the acting user on every write.
 *
 * Usage:
 *   const row = await updateWithVersion(
 *     prisma.client,               // any Prisma model delegate with a `version` field
 *     id, expectedVersion, userId,
 *     data,                        // the fields to change
 *   );
 */

/** Minimal shape of a Prisma model delegate we rely on. */
interface VersionedDelegate {
  updateMany(args: {
    where: { id: string; version: number };
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findUnique(args: { where: { id: string } }): Promise<unknown>;
}

/**
 * Concurrency-guarded update. Throws:
 *   - 404 if the row does not exist
 *   - 409 if the version does not match (stale write)
 * Returns the updated row.
 */
export async function updateWithVersion<T>(
  delegate: VersionedDelegate,
  id: string,
  expectedVersion: number,
  userId: string | null,
  data: Record<string, unknown>,
): Promise<T> {
  const res = await delegate.updateMany({
    where: { id, version: expectedVersion },
    data: { ...data, version: { increment: 1 }, updatedById: userId },
  });

  if (res.count === 0) {
    // Distinguish "gone" from "stale" for a clearer client message.
    const exists = await delegate.findUnique({ where: { id } });
    if (!exists) throw new AuthError("Not found", 404);
    throw new AuthError(
      "This record was changed by someone else. Reload and try again.",
      409,
    );
  }

  return (await delegate.findUnique({ where: { id } })) as T;
}

/**
 * Parse & require the `version` field from a request body for an update.
 * Throws 422 if absent/invalid so stale clients can't bypass the guard.
 */
export function requireVersion(body: unknown): number {
  const v = (body as { version?: unknown })?.version;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw new AuthError("A valid `version` is required for updates", 422);
  }
  return v;
}
