"use client";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { apiFetch } from "@frontend/lib/fetcher";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
}

/**
 * Shared across every mounted picker.
 *
 * An expense claim can hold a dozen lines, each with its own GL-code picker.
 * Fetching per instance would fire a dozen identical requests when the dialog
 * opens, so the promise is cached at module level and every picker awaits the
 * same one.
 */
let cache: Promise<AccountOption[]> | null = null;
function loadAccounts(): Promise<AccountOption[]> {
  cache ??= apiFetch<AccountOption[]>("/api/lookups/accounts").catch(() => {
    cache = null; // let a later mount retry rather than caching the failure
    return [];
  });
  return cache;
}

/**
 * Picks a GL account by its code, which is what the backend stores.
 *
 * A mistyped code silently posts to the wrong account, or fails at posting time
 * long after the claim was entered, so this is one of the fields most worth
 * taking away from free text (client amendments, Aug 2026).
 */
export function AccountSelect({
  value,
  onChange,
  type,
  className,
  placeholder = "Select account",
}: {
  value: string | undefined;
  onChange: (code: string) => void;
  /** Narrow to one account type, e.g. EXPENSE for a cost code. */
  type?: AccountOption["type"];
  className?: string;
  placeholder?: string;
}) {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  useEffect(() => {
    let live = true;
    loadAccounts().then((a) => { if (live) setAccounts(a); });
    return () => { live = false; };
  }, []);

  const options = type ? accounts.filter((a) => a.type === type) : accounts;
  // A code already saved against a now-inactive account still renders, so
  // editing an old record never silently rewrites its GL coding.
  const known = options.some((a) => a.code === value);

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {!known && value ? <SelectItem value={value}>{value}</SelectItem> : null}
        {options.map((a) => (
          <SelectItem key={a.id} value={a.code}>
            <span className="font-mono">{a.code}</span>
            <span className="ml-2 text-muted-foreground">{a.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
