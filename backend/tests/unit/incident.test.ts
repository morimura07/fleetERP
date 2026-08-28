import { describe, it, expect } from "vitest";
import { damageRatioPct, recoveryPct } from "@backend/services/operational-kpi";

describe("damage ratio", () => {
  it("expresses the loss as a share of the shipment's value", () => {
    expect(damageRatioPct(10000, 2500)).toBe(25);
    expect(damageRatioPct("8000.00", "1000.00")).toBe(12.5);
  });

  it("is 100 when the whole shipment is lost", () => {
    expect(damageRatioPct(5000, 5000)).toBe(100);
  });

  it("is 0 for an incident with no loss recorded", () => {
    expect(damageRatioPct(5000, 0)).toBe(0);
  });

  it("returns 0 rather than dividing by a zero cargo value", () => {
    // A report filed before the shipment is valued must not blow up the list.
    expect(damageRatioPct(0, 500)).toBe(0);
  });

  it("rounds to one decimal", () => {
    expect(damageRatioPct(3000, 1000)).toBe(33.3);
  });
});

describe("insurance recovery", () => {
  it("expresses the settlement as a share of the loss", () => {
    expect(recoveryPct(4000, 3000)).toBe(75);
  });

  it("is 0 before anything is recovered", () => {
    expect(recoveryPct(4000, 0)).toBe(0);
  });

  it("can exceed 100 when the payout beats the assessed loss", () => {
    // Worth surfacing rather than clamping: it usually means the loss figure
    // was revised down after the claim was agreed.
    expect(recoveryPct(1000, 1200)).toBe(120);
  });

  it("returns 0 when there is no loss to recover against", () => {
    expect(recoveryPct(0, 500)).toBe(0);
  });
});
