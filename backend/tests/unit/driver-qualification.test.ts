import { describe, it, expect } from "vitest";
import {
  dispatchHolds, isClearToDrive, upcomingRenewals, daysUntil,
} from "@backend/services/driver-qualification";

const asOf = new Date("2026-09-16T00:00:00Z");
const inDays = (n: number) => new Date(asOf.getTime() + n * 86_400_000);

const fit = { status: "ACTIVE", licenseExpiry: inDays(400), medicalCertExpiry: inDays(200) };

const test = (daysAgo: number, outcome: "NEGATIVE" | "POSITIVE" | "REFUSED" | "PENDING", sapReferral = false) => ({
  kind: "DRUG_ALCOHOL_TEST" as const,
  occurredAt: inDays(-daysAgo),
  renewalDue: null,
  outcome,
  sapReferral,
});

describe("clear to drive", () => {
  it("passes a driver with nothing wrong", () => {
    const holds = dispatchHolds(fit, [], [], asOf);
    expect(holds).toEqual([]);
    expect(isClearToDrive(holds)).toBe(true);
  });

  it("blocks an expired licence, and says by how much", () => {
    const holds = dispatchHolds({ ...fit, licenseExpiry: inDays(-12) }, [], [], asOf);
    expect(holds).toEqual([{ reason: "Licence expired 12 days ago", blocking: true }]);
    expect(isClearToDrive(holds)).toBe(false);
  });

  it("blocks a driver with no licence expiry on file at all", () => {
    // Unknown is not the same as fine. A dispatcher cannot assume.
    const holds = dispatchHolds({ ...fit, licenseExpiry: null }, [], [], asOf);
    expect(holds[0].blocking).toBe(true);
    expect(holds[0].reason).toMatch(/No licence expiry/);
  });

  it("warns, but does not block, a licence expiring within 30 days", () => {
    const holds = dispatchHolds({ ...fit, licenseExpiry: inDays(10) }, [], [], asOf);
    expect(holds).toEqual([{ reason: "Licence expires in 10 days", blocking: false }]);
    expect(isClearToDrive(holds)).toBe(true);
  });

  it("blocks an expired medical", () => {
    const holds = dispatchHolds({ ...fit, medicalCertExpiry: inDays(-1) }, [], [], asOf);
    expect(holds.some((h) => h.blocking && /Medical expired/.test(h.reason))).toBe(true);
  });

  it("does not block a driver with no medical recorded", () => {
    // Medicals are not mandatory for every class of driving, so absence is
    // not an expiry. The compliance report still lists it as unrecorded.
    expect(dispatchHolds({ ...fit, medicalCertExpiry: null }, [], [], asOf)).toEqual([]);
  });

  it("blocks an inactive driver regardless of paperwork", () => {
    const holds = dispatchHolds({ ...fit, status: "INACTIVE" }, [], [], asOf);
    expect(holds[0]).toEqual({ reason: "Driver is inactive", blocking: true });
  });
});

describe("drug and alcohol results", () => {
  it("blocks on a positive result", () => {
    const holds = dispatchHolds(fit, [], [test(5, "POSITIVE")], asOf);
    expect(holds.some((h) => h.blocking && /Positive/.test(h.reason))).toBe(true);
  });

  it("clears a positive once a later negative is on file", () => {
    // That is what a return-to-duty test is for.
    const holds = dispatchHolds(fit, [], [test(30, "POSITIVE"), test(3, "NEGATIVE")], asOf);
    expect(isClearToDrive(holds)).toBe(true);
  });

  it("uses the latest test, not the order the rows arrived in", () => {
    const holds = dispatchHolds(fit, [], [test(3, "NEGATIVE"), test(30, "POSITIVE")], asOf);
    expect(isClearToDrive(holds)).toBe(true);
  });

  it("blocks a refusal as firmly as a positive", () => {
    const holds = dispatchHolds(fit, [], [test(1, "REFUSED")], asOf);
    expect(holds.some((h) => h.blocking)).toBe(true);
  });

  it("warns on a pending result rather than blocking", () => {
    const holds = dispatchHolds(fit, [], [test(1, "PENDING")], asOf);
    expect(holds).toEqual([{ reason: "Drug or alcohol result pending", blocking: false }]);
  });

  it("warns while under SAP referral", () => {
    const holds = dispatchHolds(fit, [], [test(10, "POSITIVE", true)], asOf);
    expect(holds.map((h) => h.reason)).toContain("Under SAP referral");
  });

  it("drops the SAP warning once cleared", () => {
    const holds = dispatchHolds(fit, [], [test(10, "POSITIVE", true), test(2, "NEGATIVE", true)], asOf);
    expect(holds.map((h) => h.reason)).not.toContain("Under SAP referral");
  });

  it("ignores a test dated in the future", () => {
    // A scheduled test is not a result.
    expect(dispatchHolds(fit, [], [test(-5, "POSITIVE")], asOf)).toEqual([]);
  });
});

describe("certifications", () => {
  it("warns on an expired endorsement without blocking", () => {
    // A lapsed hazmat endorsement stops hazmat runs, not dry goods.
    const holds = dispatchHolds(fit, [{ type: "HAZMAT", expiresAt: inDays(-40) }], [], asOf);
    expect(holds).toEqual([{ reason: "Hazmat endorsement expired 40 days ago", blocking: false }]);
    expect(isClearToDrive(holds)).toBe(true);
  });

  it("says nothing about a current endorsement", () => {
    expect(dispatchHolds(fit, [{ type: "HAZMAT", expiresAt: inDays(100) }], [], asOf)).toEqual([]);
  });
});

describe("upcoming renewals", () => {
  it("lists what lapses inside the window, soonest first", () => {
    const r = upcomingRenewals(
      { ...fit, licenseExpiry: inDays(60), medicalCertExpiry: inDays(20) },
      [{ type: "HAZMAT", expiresAt: inDays(45) }],
      [],
      asOf,
    );
    expect(r.map((x) => x.what)).toEqual(["Medical certificate", "Hazmat endorsement", "Driving licence"]);
    expect(r.map((x) => x.daysLeft)).toEqual([20, 45, 60]);
  });

  it("leaves out anything beyond the window", () => {
    const r = upcomingRenewals(fit, [], [], asOf, 90);
    expect(r).toEqual([]);
  });

  it("marks the overdue and keeps them at the top", () => {
    const r = upcomingRenewals({ ...fit, medicalCertExpiry: inDays(-5) }, [], [], asOf);
    expect(r[0]).toMatchObject({ what: "Medical certificate", daysLeft: -5, overdue: true });
  });

  it("takes the next due date from the latest entry of each kind", () => {
    // Two MVR checks on file; only the newer one's renewal counts.
    const r = upcomingRenewals(fit, [], [
      { kind: "MVR_CHECK", occurredAt: inDays(-400), renewalDue: inDays(-35), outcome: "PASS" },
      { kind: "MVR_CHECK", occurredAt: inDays(-30), renewalDue: inDays(40), outcome: "PASS" },
    ], asOf);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ what: "Motor vehicle record check", daysLeft: 40 });
  });

  it("never lists a violation as something to renew", () => {
    const r = upcomingRenewals(fit, [], [
      { kind: "VIOLATION", occurredAt: inDays(-10), renewalDue: inDays(5), outcome: "NOT_APPLICABLE" },
    ], asOf);
    expect(r).toEqual([]);
  });

  it("includes training that has a refresher date", () => {
    const r = upcomingRenewals(fit, [], [
      { kind: "TRAINING", occurredAt: inDays(-300), renewalDue: inDays(65), outcome: "PASS" },
    ], asOf);
    expect(r[0]).toMatchObject({ what: "Training", daysLeft: 65 });
  });
});

describe("days until", () => {
  it("counts whole days and goes negative once past", () => {
    expect(daysUntil(inDays(3), asOf)).toBe(3);
    expect(daysUntil(inDays(-3), asOf)).toBe(-3);
    expect(daysUntil(null, asOf)).toBeNull();
  });
});
