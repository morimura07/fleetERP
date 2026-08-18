import { describe, it, expect } from "vitest";
import { CURRENCIES, CURRENCY_CODES, isCurrencyCode, currencyLabel } from "@backend/lib/currency";
import { orderSchema, exchangeRateSchema } from "@backend/lib/validations";

const baseOrder = {
  clientId: "clm00000000000000000000000",
  originZone: "Dar es Salaam Port",
  destinationZone: "Kigali Depot",
  cargoDescription: "Demo cargo",
  freightAmount: "3500",
  bookingDate: new Date(),
};

describe("currency registry", () => {
  it("covers every PRD operating country", () => {
    // TZ / KE / UG / RW / ZM / DRC — a missing one silently blocks that market.
    for (const code of ["USD", "TZS", "KES", "UGX", "RWF", "ZMW", "CDF"]) {
      expect(isCurrencyCode(code)).toBe(true);
    }
  });

  it("has no duplicate codes and names every entry", () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(CURRENCIES.every((c) => c.name.trim().length > 0)).toBe(true);
  });

  it("exposes the codes as a non-empty tuple for z.enum", () => {
    expect(CURRENCY_CODES.length).toBe(CURRENCIES.length);
    expect(CURRENCY_CODES[0]).toBe("USD"); // the default must be a valid member
  });

  it("labels a known code and passes an unknown one through", () => {
    expect(currencyLabel("TZS")).toBe("TZS — Tanzanian Shilling");
    expect(currencyLabel("XXX")).toBe("XXX"); // historical value, not offered any more
  });

  it("rejects codes that merely look right", () => {
    expect(isCurrencyCode("JPY")).toBe(false);
    expect(isCurrencyCode("usd")).toBe(false); // case-sensitive on purpose
  });
});

describe("currency validation on the API", () => {
  it("accepts a supported currency on an order", () => {
    const parsed = orderSchema.parse({ ...baseOrder, currency: "TZS" });
    expect(parsed.currency).toBe("TZS");
  });

  it("defaults to USD when omitted", () => {
    expect(orderSchema.parse(baseOrder).currency).toBe("USD");
  });

  it("rejects free text that used to pass the old length(3) rule", () => {
    // This is the bug the client reported: "ABC" was previously accepted.
    expect(() => orderSchema.parse({ ...baseOrder, currency: "ABC" })).toThrow();
    expect(() => orderSchema.parse({ ...baseOrder, currency: "US" })).toThrow();
    expect(() => orderSchema.parse({ ...baseOrder, currency: "usd" })).toThrow();
  });

  it("applies the same rule to exchange rates, so FX cannot reference a bad code", () => {
    expect(() =>
      exchangeRateSchema.parse({ currency: "ABC", baseCurrency: "USD", rate: "1.5", validFrom: new Date() }),
    ).toThrow();
  });
});
