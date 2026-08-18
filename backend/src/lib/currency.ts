/**
 * The currencies the system offers (ISO 4217).
 *
 * The PRD's six operating countries come first — Tanzania, Kenya, Uganda,
 * Rwanda, Zambia, DRC — followed by the currencies these corridors actually
 * quote and settle in for imports and cross-border freight.
 *
 * This is the single source: adding an entry here makes it selectable in every
 * currency dropdown AND accepted by every currency-validated API. There is
 * nowhere else to edit. Mirrored in `frontend/lib/currency.ts` (see PRD-STATUS
 * on the deliberately duplicated cross-cutting tables).
 */
export const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "TZS", name: "Tanzanian Shilling" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "UGX", name: "Ugandan Shilling" },
  { code: "RWF", name: "Rwandan Franc" },
  { code: "ZMW", name: "Zambian Kwacha" },
  { code: "CDF", name: "Congolese Franc" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Pound Sterling" },
  { code: "ZAR", name: "South African Rand" },
  { code: "AED", name: "UAE Dirham" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "INR", name: "Indian Rupee" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

/** Non-empty tuple — the shape `z.enum()` requires. */
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as unknown as [CurrencyCode, ...CurrencyCode[]];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCIES.some((c) => c.code === value);
}

/** "USD — US Dollar". Falls back to the raw code for historical values no longer offered. */
export function currencyLabel(code: string): string {
  const found = CURRENCIES.find((c) => c.code === code);
  return found ? `${found.code} — ${found.name}` : code;
}
