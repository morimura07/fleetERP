/**
 * Server-side formatting & query helpers used by route handlers.
 * (Mirrors the pure helpers from the web app's lib/utils, minus the UI-only
 * className/currency helpers, so the backend has no frontend dependency.)
 */

export function formatDate(date: Date | string, withTime = false): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

/** Build a Prisma orderBy from query params with an allowlist. */
export function buildOrderBy<T extends string>(
  sort: string | undefined,
  order: string | undefined,
  allowed: readonly T[],
  fallback: T,
): Record<string, "asc" | "desc"> {
  const field = (allowed as readonly string[]).includes(sort ?? "")
    ? (sort as T)
    : fallback;
  const dir = order === "asc" ? "asc" : "desc";
  return { [field]: dir };
}
