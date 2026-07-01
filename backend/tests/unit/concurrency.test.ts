import { describe, it, expect } from "vitest";
import { updateWithVersion, requireVersion } from "@backend/lib/concurrency";
import { AuthError } from "@backend/lib/errors";

/** Minimal in-memory Prisma-delegate mock for one row. */
function mockDelegate(row: { id: string; version: number } | null) {
  return {
    async updateMany({ where, data }: { where: { id: string; version: number }; data: Record<string, unknown> }) {
      if (row && row.id === where.id && row.version === where.version) {
        row.version += 1;
        Object.assign(row, { updatedById: data.updatedById });
        return { count: 1 };
      }
      return { count: 0 };
    },
    async findUnique({ where }: { where: { id: string } }) {
      return row && row.id === where.id ? row : null;
    },
  };
}

describe("updateWithVersion — optimistic concurrency", () => {
  it("updates and bumps the version when the expected version matches", async () => {
    const row = { id: "a", version: 3 };
    const out = await updateWithVersion<typeof row>(mockDelegate(row), "a", 3, "u1", { name: "x" });
    expect(out.version).toBe(4);
    expect((out as { updatedById?: string }).updatedById).toBe("u1");
  });

  it("throws 409 when the version is stale", async () => {
    const row = { id: "a", version: 5 };
    await expect(updateWithVersion(mockDelegate(row), "a", 3, "u1", {})).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws 404 when the row does not exist", async () => {
    await expect(updateWithVersion(mockDelegate(null), "missing", 0, "u1", {})).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("requireVersion", () => {
  it("returns the version when valid", () => {
    expect(requireVersion({ version: 2 })).toBe(2);
    expect(requireVersion({ version: 0 })).toBe(0);
  });

  it("throws 422 when version is missing or invalid", () => {
    expect(() => requireVersion({})).toThrow(AuthError);
    expect(() => requireVersion({ version: "3" })).toThrow(AuthError);
    expect(() => requireVersion({ version: -1 })).toThrow(AuthError);
    expect(() => requireVersion({ version: 1.5 })).toThrow(AuthError);
  });
});
