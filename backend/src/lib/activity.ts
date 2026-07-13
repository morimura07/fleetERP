import { prisma } from "@backend/lib/prisma";

/** A single field's before → after change. */
export interface FieldChange {
  field: string;
  old: unknown;
  new: unknown;
}

/** The structured payload stored in `ActivityLog.detail` for a field-level diff. */
export interface FieldDiff {
  changes: FieldChange[];
}

/** Normalize a value to a JSON-comparable primitive (Date → ISO, Decimal/BigInt → string). */
function norm(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  // Prisma.Decimal, BigInt, and other objects with a toString → compare by string.
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object" && v !== null && "toFixed" in v && typeof (v as { toString: () => string }).toString === "function") {
    return (v as { toString: () => string }).toString();
  }
  return v;
}

/**
 * Compute the field-level diff between a record's before and after state (PRD §7
 * field-level audit). Only fields present in `after` are considered, and only
 * those whose value actually changed are returned. Pure — no side effects.
 *
 * `only` restricts the comparison to a whitelist of fields (typically the
 * columns a route actually updates), so noise like `updatedAt`/`version` never
 * shows up. Values are normalized (Date → ISO, Decimal → string) before compare.
 */
export function diffFields(
  before: unknown,
  after: unknown,
  only?: string[],
): FieldChange[] {
  if (!after || typeof after !== "object") return [];
  const a = after as Record<string, unknown>;
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const fields = only ?? Object.keys(a);
  const changes: FieldChange[] = [];
  for (const field of fields) {
    if (!(field in a)) continue;
    const oldV = norm(b[field]);
    const newV = norm(a[field]);
    if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
      changes.push({ field, old: oldV, new: newV });
    }
  }
  return changes;
}

/**
 * Record an UPDATE audit entry carrying the field-level diff. No-ops (records
 * nothing) when nothing actually changed, so unchanged saves don't spam the log.
 */
export async function logFieldChanges(params: {
  userId?: string | null;
  target: string;
  before: unknown;
  after: unknown;
  only?: string[];
  ipAddress?: string | null;
}) {
  const changes = diffFields(params.before, params.after, params.only);
  if (changes.length === 0) return;
  await logActivity({
    userId: params.userId,
    action: "UPDATE",
    target: params.target,
    detail: { changes } satisfies FieldDiff,
    ipAddress: params.ipAddress,
  });
}

/** Record an audit-log entry. Failures must never break the main flow. */
export async function logActivity(params: {
  userId?: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "EXPORT" | string;
  target: string;
  detail?: unknown;
  ipAddress?: string | null;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        target: params.target,
        detail:
          params.detail === undefined
            ? null
            : typeof params.detail === "string"
              ? params.detail
              : JSON.stringify(params.detail),
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (e) {
    console.error("[activity] failed to log", e);
  }
}
