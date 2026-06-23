import { describe, it, expect } from "vitest";
import { vendorInvoiceTotal, customerInvoiceTotal, agingBucket } from "@/lib/services/ap-ar";

describe("vendorInvoiceTotal", () => {
  it("computes net payable = subtotal + vat − wht", () => {
    expect(vendorInvoiceTotal("1000", "180", "60").toString()).toBe("1120");
  });
  it("handles zero tax", () => {
    expect(vendorInvoiceTotal("500.50", "0", "0").toString()).toBe("500.5");
  });
});

describe("customerInvoiceTotal", () => {
  it("computes total = subtotal + vat", () => {
    expect(customerInvoiceTotal("2000", "320").toString()).toBe("2320");
  });
});

describe("agingBucket", () => {
  const today = new Date("2026-06-30");
  it("returns current when not yet due", () => {
    expect(agingBucket(new Date("2026-07-15"), today)).toBe("current");
    expect(agingBucket(null, today)).toBe("current");
  });
  it("buckets 1–30 days overdue", () => {
    expect(agingBucket(new Date("2026-06-15"), today)).toBe("d1_30");
  });
  it("buckets 31–60 days overdue", () => {
    expect(agingBucket(new Date("2026-05-15"), today)).toBe("d31_60");
  });
  it("buckets 90+ days overdue", () => {
    expect(agingBucket(new Date("2026-01-01"), today)).toBe("d90_plus");
  });
});
