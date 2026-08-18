import { describe, it, expect, beforeEach } from "vitest";
import { areaScope, areaForWrite, assertSameArea, isCrossEntity, isPlatformAdmin, reachableAreas, canReachArea } from "@backend/lib/scope";
import { hydrateOrganizations } from "@backend/lib/organization";
import type { AuthUser } from "@backend/lib/auth";

/**
 * Two tenants sharing one database:
 *   ORG-A  → HQ01, KE01     (the customer we mostly act as)
 *   ORG-B  → ZM01           (a different customer — must never be visible)
 */
const ORG_A = "org_a";
const ORG_B = "org_b";

const mk = (
  role: AuthUser["role"],
  dataAreaId = "HQ01",
  organizationId: string | null = ORG_A,
  activeArea?: string,
): AuthUser => ({
  id: "u", email: "u@x", name: "U", role, roleKey: null, driverId: null,
  dataAreaId, organizationId, activeArea,
});

beforeEach(() => {
  hydrateOrganizations([
    { code: "HQ01", organizationId: ORG_A },
    { code: "KE01", organizationId: ORG_A },
    { code: "ZM01", organizationId: ORG_B },
  ]);
});

describe("company isolation within one organization", () => {
  it("scopes non-admin roles to their own entity", () => {
    for (const role of ["FINANCE", "DISPATCHER", "STAFF", "DRIVER"] as const) {
      expect(isCrossEntity(mk(role))).toBe(false);
      expect(areaScope(mk(role, "KE01"))).toEqual({ dataAreaId: "KE01" });
    }
  });

  it("lets an ADMIN see every entity in their own organization", () => {
    expect(isCrossEntity(mk("ADMIN"))).toBe(true);
    expect(areaScope(mk("ADMIN"))).toEqual({ dataAreaId: { in: ["HQ01", "KE01"] } });
  });

  it("collapses to a plain equality when an organization holds one entity", () => {
    expect(areaScope(mk("ADMIN", "ZM01", ORG_B))).toEqual({ dataAreaId: "ZM01" });
  });

  it("writes into the caller's own entity, ignoring a spoofed target", () => {
    expect(areaForWrite(mk("FINANCE", "KE01"), "HQ01")).toBe("KE01");
    expect(areaForWrite(mk("FINANCE", "KE01"))).toBe("KE01");
  });

  it("lets an ADMIN target another entity inside their organization", () => {
    expect(areaForWrite(mk("ADMIN", "HQ01"), "KE01")).toBe("KE01");
    expect(areaForWrite(mk("ADMIN", "HQ01"))).toBe("HQ01");
  });
});

describe("organization isolation between tenants", () => {
  it("does not let an ADMIN read another organization's entity", () => {
    const adminA = mk("ADMIN", "HQ01", ORG_A);
    expect(canReachArea(adminA, "ZM01")).toBe(false);
    expect(() => assertSameArea(adminA, { dataAreaId: "ZM01" })).toThrow();
  });

  it("ignores a company-switcher header pointing at another organization", () => {
    // The X-Data-Area header is caller-supplied: it must never widen reach.
    const spoofing = mk("ADMIN", "HQ01", ORG_A, "ZM01");
    expect(areaScope(spoofing)).toEqual({ dataAreaId: "HQ01" });
    expect(areaForWrite(spoofing)).toBe("HQ01");
  });

  it("honours the switcher for an entity inside the caller's own organization", () => {
    const switching = mk("ADMIN", "HQ01", ORG_A, "KE01");
    expect(areaScope(switching)).toEqual({ dataAreaId: "KE01" });
    expect(areaForWrite(switching)).toBe("KE01");
  });

  it("refuses to write into another organization even when explicitly asked", () => {
    expect(areaForWrite(mk("ADMIN", "HQ01", ORG_A), "ZM01")).toBe("HQ01");
  });

  it("returns 404 rather than 403 so the other tenant's existence stays hidden", () => {
    try {
      assertSameArea(mk("ADMIN", "HQ01", ORG_A), { dataAreaId: "ZM01" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as { status: number }).status).toBe(404);
    }
  });
});

describe("platform operator", () => {
  it("reads across every organization", () => {
    const root = mk("SUPER_ADMIN", "HQ01", null);
    expect(isPlatformAdmin(root)).toBe(true);
    expect(reachableAreas(root)).toBeNull();
    expect(areaScope(root)).toEqual({});
    expect(() => assertSameArea(root, { dataAreaId: "ZM01" })).not.toThrow();
  });

  it("is the only role that is platform-level", () => {
    for (const role of ["ADMIN", "FINANCE", "DISPATCHER", "STAFF", "DRIVER"] as const) {
      expect(isPlatformAdmin(mk(role))).toBe(false);
    }
  });
});

describe("fail-closed behaviour", () => {
  it("limits an ADMIN to their own entity when the org map is empty", () => {
    // Startup hydration failed: reach must narrow, never widen to all tenants.
    hydrateOrganizations([]);
    expect(areaScope(mk("ADMIN", "HQ01", ORG_A))).toEqual({ dataAreaId: "HQ01" });
  });

  it("limits an ADMIN with no resolvable organization to their own entity", () => {
    expect(areaScope(mk("ADMIN", "HQ01", null))).toEqual({ dataAreaId: "HQ01" });
  });

  it("still rejects a missing row", () => {
    expect(() => assertSameArea(mk("SUPER_ADMIN", "HQ01", null), null)).toThrow();
  });
});
