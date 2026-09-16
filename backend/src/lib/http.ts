import type { Context } from "hono";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError } from "@backend/lib/errors";

/**
 * Shared HTTP helpers for the standalone API — the Hono equivalents of the
 * monolith's lib/api.ts (ok/created/error + mapError). Response envelope is kept
 * identical ({ data, meta } / { error, details }) so the frontend client is
 * unchanged.
 */

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const pageMeta = (page: number, pageSize: number, total: number): PageMeta => ({
  page,
  pageSize,
  total,
  totalPages: Math.ceil(total / pageSize) || 1,
});

export const ok = <T>(c: Context, data: T, meta?: PageMeta) =>
  c.json(meta ? { data, meta } : { data });

export const created = <T>(c: Context, data: T) => c.json({ data }, 201);

/** Pure error → (status, message, details) mapper (ported from lib/api.ts). */
export function mapError(e: unknown): { status: number; message: string; details?: unknown } {
  if (e instanceof AuthError) return { status: e.status, message: e.message, details: e.details };
  if (e instanceof ZodError) return { status: 422, message: "Invalid input", details: e.flatten().fieldErrors };
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined)?.join(", ");
      return { status: 409, message: `Already exists${target ? `: ${target}` : ""}` };
    }
    if (e.code === "P2025") return { status: 404, message: "Not found" };
    if (e.code === "P2003") return { status: 409, message: "Cannot complete: related records exist" };
    // P1xxx: the database itself, not the query. Say so, and say it is temporary.
    if (e.code.startsWith("P1")) return { status: 503, message: "The database is not reachable right now. Please try again shortly." };
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    return { status: 503, message: "The database is not reachable right now. Please try again shortly." };
  }
  // c.req.json() on a body that is not JSON: the client's mistake, not ours.
  if (e instanceof SyntaxError) return { status: 400, message: "Request body is not valid JSON" };
  return { status: 500, message: "A server error occurred" };
}

/** Global Hono onError handler. */
export function onError(e: Error, c: Context) {
  const mapped = mapError(e);
  if (mapped.status >= 500) console.error(`[api] ${mapped.status} on ${c.req.method} ${c.req.path}`, e);
  return c.json({ error: mapped.message, ...(mapped.details ? { details: mapped.details } : {}) }, mapped.status as never);
}
