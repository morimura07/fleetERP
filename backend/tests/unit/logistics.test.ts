import { describe, it, expect } from "vitest";
import { checklistFor, estimateDuty } from "@backend/services/logistics";

const REQUIRED = ["TRANSPORT_DOCUMENT", "COMMERCIAL_INVOICE", "PACKING_LIST"];

describe("shipping document checklist", () => {
  it("blocks the GRN until every required paper is verified, and says which", () => {
    const c = checklistFor([{ docType: "TRANSPORT_DOCUMENT", verified: true }, { docType: "COMMERCIAL_INVOICE", verified: false }], REQUIRED, true);
    expect(c.complete).toBe(false);
    expect(c.blocking).toMatch(/commercial invoice, packing list/);
    expect(c.required.find((r) => r.docType === "COMMERCIAL_INVOICE")).toMatchObject({ present: true, verified: false });
  });

  it("is complete once each type has a verified copy", () => {
    const c = checklistFor(REQUIRED.map((docType) => ({ docType, verified: true })), REQUIRED, true);
    expect(c.complete).toBe(true);
    expect(c.blocking).toBeNull();
  });

  it("reports but does not block when the policy does not enforce it", () => {
    const c = checklistFor([], REQUIRED, false);
    expect(c.complete).toBe(false);
    expect(c.blocking).toBeNull();
  });
});

describe("duty estimate", () => {
  it("charges VAT on value plus duty, then adds other charges", () => {
    // 1,250 at 25% duty = 312.50; VAT 18% on 1,562.50 = 281.25; other 40.
    const e = estimateDuty({ customsValue: 1250, dutyRatePct: 25, vatRatePct: 18, otherCharges: 40 });
    expect(e.duty.toNumber()).toBe(312.5);
    expect(e.vat.toNumber()).toBe(281.25);
    expect(e.total.toNumber()).toBe(633.75);
  });

  it("handles no VAT and no other charges", () => {
    const e = estimateDuty({ customsValue: 1000, dutyRatePct: 10 });
    expect(e.total.toNumber()).toBe(100);
  });
});
