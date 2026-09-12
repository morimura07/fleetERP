"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@frontend/lib/fetcher";

export interface KpiTile {
  label: string;
  /** Already formatted. A dash means the figure is not computable yet. */
  value: string;
  /** Secondary line under the value: a denominator, a caveat, a scope note. */
  hint?: string;
  /** Draws attention when the figure is the one someone must act on. */
  tone?: "default" | "warn" | "danger";
}

const TONE: Record<NonNullable<KpiTile["tone"]>, string> = {
  default: "text-foreground",
  warn: "text-warning",
  danger: "text-destructive",
};

/**
 * The strip of figures above a table.
 *
 * It takes the same filters as the table beneath it and reads them from a
 * matching `/summary` endpoint, so the numbers always describe the rows on
 * screen. A ribbon computed from the current page instead would change every
 * time someone turned the page, which is worse than no ribbon at all.
 */
export function KpiRibbon<T>({
  endpoint,
  filters,
  refreshKey,
  tiles,
}: {
  /** Summary endpoint, e.g. "/api/operational-kpi/dock-events/summary". */
  endpoint: string;
  filters?: Record<string, string>;
  refreshKey?: number;
  /** Turns the payload into tiles. Formatting lives with the screen. */
  tiles: (summary: T | null) => KpiTile[];
}) {
  const [summary, setSummary] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  // Serialised so the effect compares by value; a fresh object each render
  // would otherwise refetch on every keystroke in the search box.
  const key = JSON.stringify(filters ?? {});

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries((JSON.parse(key) ?? {}) as Record<string, string>)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    apiFetch<T>(`${endpoint}${qs ? `?${qs}` : ""}`)
      .then((s) => { if (live) { setSummary(s); setFailed(false); } })
      .catch(() => { if (live) { setSummary(null); setFailed(true); } });
    return () => { live = false; };
  }, [endpoint, key, refreshKey]);

  const cells = tiles(summary);

  return (
    <div className="mb-4 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((t) => (
        <div key={t.label} className="bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${TONE[t.tone ?? "default"]}`}>
            {failed ? "—" : t.value}
          </p>
          {/* The hint keeps its space when empty so the tiles stay aligned. */}
          <p className="mt-0.5 min-h-4 text-xs text-muted-foreground">
            {failed ? "Unavailable" : t.hint ?? ""}
          </p>
        </div>
      ))}
    </div>
  );
}
