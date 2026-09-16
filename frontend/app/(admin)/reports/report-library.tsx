"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, AlertTriangle } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@frontend/components/ui/table";
import { Loader } from "@frontend/components/ui/loader";
import { useToast } from "@frontend/components/ui/toast";
import { ExportMenu } from "@frontend/components/data/export-menu";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

interface ReportParam {
  name: string;
  label: string;
  kind: "date" | "period" | "corridor" | "vehicle" | "client";
  required?: boolean;
}

interface CatalogueEntry {
  key: string;
  title: string;
  group: string;
  description: string;
  params: ReportParam[];
  unavailable: string | null;
}

interface Catalogue {
  groups: Record<string, string>;
  reports: CatalogueEntry[];
}

interface ReportResult {
  key: string;
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  summary: { label: string; value: string; hint?: string }[];
  rowCount: number;
}

const CORRIDORS = [
  { value: "", label: "All corridors" },
  { value: "NORTHERN", label: "Northern" },
  { value: "CENTRAL", label: "Central" },
  { value: "DOMESTIC", label: "Domestic" },
];

/** Radix Select cannot hold an empty string, so "any" needs a stand-in. */
const ANY = "__any__";

/** First of this month and today, which is what most reports are asked for. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: first.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

/** Numbers right-aligned and tabular; dates as a day; everything else as is. */
function cell(value: unknown): { text: string; numeric: boolean } {
  if (value === null || value === undefined) return { text: "—", numeric: false };
  if (typeof value === "number") return { text: value.toLocaleString(undefined, { maximumFractionDigits: 2 }), numeric: true };
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return { text: value.slice(0, 10), numeric: false };
  return { text: String(value), numeric: false };
}

/**
 * Runs any report in the library.
 *
 * The catalogue, the parameter form, the results and the export all come from
 * the report's own definition on the server, so a report registered there
 * appears here with no change to this file.
 */
export function ReportLibrary() {
  const { toast } = useToast();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    apiFetch<Catalogue>("/api/reports/library")
      .then((c) => {
        setCatalogue(c);
        setSelectedKey((k) => k || c.reports.find((r) => !r.unavailable)?.key || "");
      })
      .catch(() => setCatalogue({ groups: {}, reports: [] }));
  }, []);

  const selected = useMemo(
    () => catalogue?.reports.find((r) => r.key === selectedKey) ?? null,
    [catalogue, selectedKey],
  );

  // Reset the form when the report changes, seeding dates so the common case
  // is one click rather than four.
  useEffect(() => {
    if (!selected) return;
    const next: Record<string, string> = {};
    const range = defaultRange();
    for (const p of selected.params) {
      if (p.name === "from") next.from = range.from;
      if (p.name === "to") next.to = range.to;
    }
    setParams(next);
    setResult(null);
  }, [selected]);

  const grouped = useMemo(() => {
    if (!catalogue) return [];
    const byGroup = new Map<string, CatalogueEntry[]>();
    for (const r of catalogue.reports) {
      if (!byGroup.has(r.group)) byGroup.set(r.group, []);
      byGroup.get(r.group)!.push(r);
    }
    return [...byGroup.entries()].map(([group, reports]) => ({
      group,
      label: catalogue.groups[group] ?? group,
      reports,
    }));
  }, [catalogue]);

  const filters = useMemo(
    () => Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
    [params],
  );

  const run = useCallback(async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const qs = new URLSearchParams(filters).toString();
      setResult(await apiFetch<ReportResult>(`/api/reports/library/${selected.key}${qs ? `?${qs}` : ""}`));
    } catch (e) {
      setResult(null);
      toast({
        title: "Could not run the report",
        description: e instanceof ApiError ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }, [selected, filters, toast]);

  if (!catalogue) return <div className="py-10"><Loader /></div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* ── Catalogue ─────────────────────────────────────────────────── */}
      <nav className="space-y-4">
        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">No reports are available to your role.</p>
        )}
        {grouped.map((g) => (
          <div key={g.group}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
            <ul className="space-y-0.5">
              {g.reports.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(r.key)}
                    disabled={!!r.unavailable}
                    title={r.unavailable ?? r.description}
                    className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                      r.key === selectedKey
                        ? "bg-primary/10 font-medium text-primary"
                        : r.unavailable
                          ? "cursor-not-allowed text-muted-foreground/60"
                          : "hover:bg-muted"
                    }`}
                  >
                    {r.title}
                    {r.unavailable && <AlertTriangle className="ml-1.5 inline h-3 w-3" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Runner ─────────────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-4">
        {!selected ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Choose a report on the left.</p>
        ) : (
          <>
            <div>
              <h2 className="text-lg font-semibold">{selected.title}</h2>
              <p className="text-sm text-muted-foreground">{selected.description}</p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              {selected.params.map((p) => (
                <div key={p.name} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {p.label}{p.required ? " *" : ""}
                  </Label>
                  {p.kind === "corridor" ? (
                    <Select
                      value={params[p.name] || ANY}
                      onValueChange={(v) => setParams({ ...params, [p.name]: v === ANY ? "" : v })}
                    >
                      <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CORRIDORS.map((c) => (
                          <SelectItem key={c.value || ANY} value={c.value || ANY}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : p.kind === "date" ? (
                    <Input
                      type="date"
                      className="w-[150px]"
                      value={params[p.name] ?? ""}
                      onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}
                    />
                  ) : (
                    <Input
                      className="w-[150px]"
                      placeholder={p.kind === "period" ? "2026-09 or 2026-Q3" : p.label}
                      value={params[p.name] ?? ""}
                      onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}
                    />
                  )}
                </div>
              ))}
              <Button onClick={run} disabled={running}>
                <Play className="h-4 w-4" />{running ? "Running…" : "Run"}
              </Button>
              {result && (
                <ExportMenu endpoint={`/api/reports/library/${selected.key}`} filters={filters} />
              )}
            </div>

            {running && <div className="py-8"><Loader /></div>}

            {result && !running && (
              <>
                {result.summary.length > 0 && (
                  <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
                    {result.summary.map((t) => (
                      <div key={t.label} className="bg-card px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.label}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</p>
                        <p className="mt-0.5 min-h-4 text-xs text-muted-foreground">{t.hint ?? ""}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto rounded-md border">
                  {result.rows.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Nothing matched. Widen the dates or check the filters.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {result.columns.map((h) => <TableHead key={h}>{h}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.rows.map((row, i) => (
                          <TableRow key={i}>
                            {result.columns.map((h) => {
                              const c = cell(row[h]);
                              return (
                                <TableCell key={h} className={c.numeric ? "text-right tabular-nums" : undefined}>
                                  {c.text}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {result.rowCount.toLocaleString()} row{result.rowCount === 1 ? "" : "s"}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
