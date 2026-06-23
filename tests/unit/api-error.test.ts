import { describe, it, expect } from "vitest";
import { z } from "zod";
import { mapError } from "@/lib/api";
import { AuthError } from "@/lib/errors";
import { Prisma } from "@prisma/client";

describe("mapError — error → HTTP status mapping", () => {
  it("maps AuthError to its status", () => {
    expect(mapError(new AuthError("認証が必要です", 401))).toMatchObject({ status: 401, message: "認証が必要です" });
  });

  it("maps ZodError to 422 with field details", () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    const mapped = mapError((parsed as { error: unknown }).error);
    expect(mapped.status).toBe(422);
    expect(mapped.details).toBeDefined();
  });

  it("maps Prisma P2002 unique violation to 409", () => {
    const e = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target: ["email"] } });
    expect(mapError(e).status).toBe(409);
  });

  it("maps Prisma P2025 not-found to 404", () => {
    const e = new Prisma.PrismaClientKnownRequestError("nf", { code: "P2025", clientVersion: "x" });
    expect(mapError(e).status).toBe(404);
  });

  it("falls back to 500 for unknown errors", () => {
    expect(mapError(new Error("boom")).status).toBe(500);
  });
});
