import { describe, it, expect } from "vitest";
import { docStatus } from "@/lib/services/compliance";

const asOf = new Date("2026-06-25");
const plus = (days: number) => new Date(asOf.getTime() + days * 86_400_000);

describe("docStatus", () => {
  it("classifies a far-future expiry as CURRENT", () => {
    expect(docStatus(plus(90), asOf)).toBe("CURRENT");
  });

  it("classifies an expiry inside the 14-day window as EXPIRING_SOON", () => {
    expect(docStatus(plus(10), asOf)).toBe("EXPIRING_SOON");
  });

  it("classifies a past expiry as EXPIRED", () => {
    expect(docStatus(plus(-1), asOf)).toBe("EXPIRED");
  });

  it("returns MISSING when there is no expiry", () => {
    expect(docStatus(null, asOf)).toBe("MISSING");
  });

  it("respects a custom warning window", () => {
    expect(docStatus(plus(20), asOf, 14)).toBe("CURRENT");
    expect(docStatus(plus(20), asOf, 30)).toBe("EXPIRING_SOON");
  });
});
