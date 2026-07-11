"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";

/**
 * A dropdown for a fixed list of string options that the backend stores as a free
 * string (so it has no enum column). The value is the option text itself. Use for
 * spec-enumerated fields — Incoterms, valuation method, picking strategy, etc. —
 * so users pick from a list instead of typing (client dashboard/orders note).
 */
export function OptionSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
