import { describe, it, expect } from "vitest";
import { can } from "@backend/lib/rbac";

describe("RBAC", () => {
  it("ADMIN can do everything", () => {
    expect(can("ADMIN", "user:manage")).toBe(true);
    expect(can("ADMIN", "dispatch:write")).toBe(true);
    expect(can("ADMIN", "payment:write")).toBe(true);
  });

  it("DISPATCHER manages dispatch & jobs but not users", () => {
    expect(can("DISPATCHER", "dispatch:write")).toBe(true);
    expect(can("DISPATCHER", "job:write")).toBe(true);
    expect(can("DISPATCHER", "user:manage")).toBe(false);
    expect(can("DISPATCHER", "driver:write")).toBe(false);
  });

  it("DRIVER can write reports but not manage vehicles", () => {
    expect(can("DRIVER", "report:write")).toBe(true);
    expect(can("DRIVER", "vehicle:write")).toBe(false);
    expect(can("DRIVER", "dispatch:write")).toBe(false);
  });

  it("FINANCE has accounting authority but no operational write", () => {
    // Accounting authority
    expect(can("FINANCE", "ledger:post")).toBe(true);
    expect(can("FINANCE", "account:write")).toBe(true);
    expect(can("FINANCE", "order:invoice")).toBe(true);
    expect(can("FINANCE", "payment:write")).toBe(true);
    // Read-only on operations; no operational write; no user management
    expect(can("FINANCE", "order:read")).toBe(true);
    expect(can("FINANCE", "order:write")).toBe(false);
    expect(can("FINANCE", "trip:write")).toBe(false);
    expect(can("FINANCE", "dispatch:write")).toBe(false);
    expect(can("FINANCE", "user:manage")).toBe(false);
  });

  it("DISPATCHER (Operations Planner) can read books but not post to the ledger", () => {
    expect(can("DISPATCHER", "ledger:read")).toBe(true);
    expect(can("DISPATCHER", "ledger:post")).toBe(false);
    expect(can("DISPATCHER", "order:invoice")).toBe(false);
  });

  it("STAFF is read-only", () => {
    expect(can("STAFF", "job:read")).toBe(true);
    expect(can("STAFF", "job:write")).toBe(false);
    expect(can("STAFF", "report:write")).toBe(false);
  });

  it("returns false for null role", () => {
    expect(can(null, "dashboard:view")).toBe(false);
  });
});
