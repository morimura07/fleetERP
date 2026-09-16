import { describe, it, expect } from "vitest";
import { z } from "zod";
import { mapError } from "@backend/lib/http";
import { AuthError } from "@backend/lib/errors";
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

  it("maps a database that cannot be reached to 503, not a generic 500", () => {
    const e = new Prisma.PrismaClientKnownRequestError("down", { code: "P1001", clientVersion: "x" });
    expect(mapError(e)).toMatchObject({ status: 503 });
    expect(mapError(e).message).toMatch(/try again/i);
  });

  it("maps a body that is not JSON to 400", () => {
    let caught: unknown;
    try { JSON.parse("{nope"); } catch (err) { caught = err; }
    expect(mapError(caught).status).toBe(400);
  });

  it("falls back to 500 for unknown errors, without echoing the message", () => {
    const mapped = mapError(new Error("secret internal detail"));
    expect(mapped.status).toBe(500);
    expect(mapped.message).not.toContain("secret");
  });
});
