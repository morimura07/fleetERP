import { describe, it, expect, beforeEach } from "vitest";
import {
  can, permissionsFor, hydrateRbac, setRuntimeRole, removeRuntimeRole,
  DEFAULT_ROLE_PERMISSIONS,
} from "@backend/lib/rbac";

// Restore the built-in defaults before each test so cases don't leak state.
beforeEach(() => {
  hydrateRbac(
    Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([roleKey, permissions]) => ({ roleKey, permissions })),
  );
});

describe("dynamic RBAC engine", () => {
  it("resolves system-role permissions from the hydrated map", () => {
    expect(can("ADMIN", "user:manage")).toBe(true);
    expect(can("STAFF", "user:manage")).toBe(false);
    expect(can("DISPATCHER", "trip:write")).toBe(true);
  });

  it("a custom role grants exactly the permissions it was given", () => {
    setRuntimeRole("YARD_SUPERVISOR", ["dashboard:view", "trip:read", "dock-events" as never]);
    expect(can("YARD_SUPERVISOR", "dashboard:view")).toBe(true);
    expect(can("YARD_SUPERVISOR", "trip:read")).toBe(true);
    expect(can("YARD_SUPERVISOR", "user:manage")).toBe(false);
    expect(permissionsFor("YARD_SUPERVISOR")).toContain("trip:read");
  });

  it("editing a system role's grants takes effect immediately", () => {
    expect(can("STAFF", "trip:write")).toBe(false);
    setRuntimeRole("STAFF", ["trip:write"]);
    expect(can("STAFF", "trip:write")).toBe(true);
    expect(can("STAFF", "dashboard:view")).toBe(false); // replaced wholesale
  });

  it("removing a custom role revokes all its access", () => {
    setRuntimeRole("TEMP", ["order:read"]);
    expect(can("TEMP", "order:read")).toBe(true);
    removeRuntimeRole("TEMP");
    // Unknown key with no system-role default → denied.
    expect(can("TEMP", "order:read")).toBe(false);
  });

  it("falls back to built-in defaults for a known role key absent from the map", () => {
    hydrateRbac([]); // empty map
    // ADMIN isn't in the runtime map, but matches a system-role default.
    expect(can("ADMIN", "user:manage")).toBe(true);
    expect(can("STAFF", "user:manage")).toBe(false);
  });

  it("denies null/undefined/unknown roles", () => {
    expect(can(null, "dashboard:view")).toBe(false);
    expect(can(undefined, "dashboard:view")).toBe(false);
    expect(can("NOPE", "dashboard:view")).toBe(false);
  });

  it("hydrate replaces the whole map (stale roles disappear)", () => {
    setRuntimeRole("OLD", ["order:read"]);
    hydrateRbac([{ roleKey: "NEW", permissions: ["trip:read"] }]);
    expect(can("NEW", "trip:read")).toBe(true);
    expect(can("OLD", "order:read")).toBe(false);
  });
});
