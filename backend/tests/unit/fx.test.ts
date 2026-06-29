import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { convert } from "@/lib/services/fx";

describe("convert", () => {
  it("multiplies a foreign amount by the rate to reach base", () => {
    // 1,000,000 TZS × 0.000385 = 385 USD
    expect(convert("1000000", "0.000385").toString()).toBe("385");
  });

  it("preserves decimal precision (no float drift)", () => {
    expect(convert("0.1", "0.2").toString()).toBe("0.02");
  });

  it("returns the same amount at a 1:1 rate", () => {
    expect(convert("500.50", "1").toString()).toBe("500.5");
  });

  it("accepts Prisma.Decimal inputs", () => {
    expect(convert(new Prisma.Decimal("250"), new Prisma.Decimal("4")).toString()).toBe("1000");
  });
});
