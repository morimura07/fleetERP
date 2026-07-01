import { describe, it, expect } from "vitest";
import { areaScope, areaForWrite, assertSameArea, isCrossEntity } from "@backend/lib/scope";
import type { AuthUser } from "@backend/lib/auth";

const mk = (role: AuthUser["role"], dataAreaId = "HQ01"): AuthUser => ({
  id: "u", email: "u@x", name: "U", role, driverId: null, dataAreaId,
});

describe("multi-company isolation (dataAreaId)", () => {
  it("ADMIN is cross-entity (no scope filter)", () => {
    expect(isCrossEntity(mk("ADMIN"))).toBe(true);
    expect(areaScope(mk("ADMIN"))).toEqual({});
  });

  it("non-admin roles are scoped to their own entity", () => {
    for (const role of ["FINANCE", "DISPATCHER", "STAFF", "DRIVER"] as const) {
      expect(isCrossEntity(mk(role))).toBe(false);
      expect(areaScope(mk(role, "KE01"))).toEqual({ dataAreaId: "KE01" });
    }
  });

  it("scoped user always writes into their own entity, ignoring a spoofed area", () => {
    expect(areaForWrite(mk("FINANCE", "KE01"), "HQ01")).toBe("KE01"); // spoof ignored
    expect(areaForWrite(mk("FINANCE", "KE01"))).toBe("KE01");
  });

  it("admin may target an explicit entity on write", () => {
    expect(areaForWrite(mk("ADMIN", "HQ01"), "KE01")).toBe("KE01");
    expect(areaForWrite(mk("ADMIN", "HQ01"))).toBe("HQ01");
  });

  it("assertSameArea: a KE user cannot read an HQ row (throws 404)", () => {
    expect(() => assertSameArea(mk("FINANCE", "KE01"), { dataAreaId: "HQ01" })).toThrow();
    try {
      assertSameArea(mk("FINANCE", "KE01"), { dataAreaId: "HQ01" });
    } catch (e) {
      expect((e as { status: number }).status).toBe(404);
    }
  });

  it("assertSameArea: same-entity row passes; admin passes any entity", () => {
    expect(() => assertSameArea(mk("FINANCE", "KE01"), { dataAreaId: "KE01" })).not.toThrow();
    expect(() => assertSameArea(mk("ADMIN"), { dataAreaId: "KE01" })).not.toThrow();
  });

  it("assertSameArea: missing row throws 404", () => {
    expect(() => assertSameArea(mk("ADMIN"), null)).toThrow();
  });
});
