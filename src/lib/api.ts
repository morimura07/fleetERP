import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/errors";
import { Prisma } from "@prisma/client";

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ok<T>(data: T, meta?: PageMeta) {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) });
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function error(message: string, status = 400, extra?: unknown) {
  return NextResponse.json(
    { error: message, ...(extra ? { details: extra } : {}) },
    { status },
  );
}

/**
 * Pure error → (status, message, details) mapper. Kept side-effect free and
 * Next-independent so it is straightforward to unit test.
 */
export function mapError(e: unknown): { status: number; message: string; details?: unknown } {
  if (e instanceof AuthError) return { status: e.status, message: e.message };
  if (e instanceof ZodError) {
    return { status: 422, message: "Invalid input", details: e.flatten().fieldErrors };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined)?.join(", ");
      return { status: 409, message: `Already exists${target ? `: ${target}` : ""}` };
    }
    if (e.code === "P2025") return { status: 404, message: "Not found" };
    if (e.code === "P2003") return { status: 409, message: "Cannot complete: related records exist" };
  }
  return { status: 500, message: "A server error occurred" };
}

/** Map thrown errors to consistent HTTP responses. */
export function handleError(e: unknown): NextResponse {
  const mapped = mapError(e);
  if (mapped.status === 500) console.error("[api] unhandled error", e);
  return error(mapped.message, mapped.status, mapped.details);
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 };
}
