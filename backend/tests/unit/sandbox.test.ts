import { describe, it, expect } from "vitest";
import { isSandboxExpired, sandboxDaysRemaining } from "@backend/services/sandbox";

const NOW = new Date("2026-08-18T12:00:00Z");
const at = (iso: string) => new Date(iso);

describe("sandbox access window (M32)", () => {
  it("never expires a real company, whatever the date says", () => {
    // A stray expiry on a non-sandbox row must not be able to lock real users out.
    const real = { isSandbox: false, sandboxExpiresAt: at("2020-01-01T00:00:00Z") };
    expect(isSandboxExpired(real, NOW)).toBe(false);
    expect(sandboxDaysRemaining(real, NOW)).toBeNull();
  });

  it("never expires a sandbox with no window set", () => {
    const open = { isSandbox: true, sandboxExpiresAt: null };
    expect(isSandboxExpired(open, NOW)).toBe(false);
    expect(sandboxDaysRemaining(open, NOW)).toBeNull();
  });

  it("is open before the window closes and shut after", () => {
    expect(isSandboxExpired({ isSandbox: true, sandboxExpiresAt: at("2026-08-19T12:00:00Z") }, NOW)).toBe(false);
    expect(isSandboxExpired({ isSandbox: true, sandboxExpiresAt: at("2026-08-17T12:00:00Z") }, NOW)).toBe(true);
  });

  it("treats the exact expiry instant as closed", () => {
    expect(isSandboxExpired({ isSandbox: true, sandboxExpiresAt: NOW }, NOW)).toBe(true);
  });

  it("rounds remaining time up to whole days", () => {
    const days = (iso: string) => sandboxDaysRemaining({ isSandbox: true, sandboxExpiresAt: at(iso) }, NOW);
    expect(days("2026-08-25T12:00:00Z")).toBe(7);
    expect(days("2026-08-19T00:00:00Z")).toBe(1); // 12h left still counts as a day
    expect(days("2026-08-18T12:00:01Z")).toBe(1); // a second left is not "0 days"
  });

  it("reports 0 days once past, never a negative number", () => {
    const days = (iso: string) => sandboxDaysRemaining({ isSandbox: true, sandboxExpiresAt: at(iso) }, NOW);
    expect(days("2026-08-18T12:00:00Z")).toBe(0);
    expect(days("2026-01-01T00:00:00Z")).toBe(0);
  });
});
