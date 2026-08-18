"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { CURRENCIES, type CurrencyCode } from "@frontend/lib/currency";

/**
 * Currency picker backed by the shared registry (`lib/currency.ts`).
 *
 * Currency is never free text: an order's currency drives its invoice, the FX
 * rate applied at posting and the consolidation rollup, so a typo would silently
 * corrupt all three. Codes are shown with their names because the people
 * entering orders are not always the people who know the ISO codes.
 *
 * A value no longer in the registry (historical data) is still rendered, so
 * editing an old record never silently rewrites its currency.
 */
export function CurrencySelect({
  value,
  onChange,
  placeholder = "Select currency",
}: {
  value: string | undefined;
  // Emits the narrowed union so `form.setValue("currency", v)` needs no cast.
  onChange: (v: CurrencyCode) => void;
  placeholder?: string;
}) {
  const known = CURRENCIES.some((c) => c.code === value);
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v as CurrencyCode)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {!known && value ? <SelectItem value={value}>{value}</SelectItem> : null}
        {CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            <span className="font-mono">{c.code}</span>
            <span className="ml-2 text-muted-foreground">{c.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
