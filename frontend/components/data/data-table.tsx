"use client";
import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { Search, Inbox } from "lucide-react";
import { Input } from "@frontend/components/ui/input";
import { Button } from "@frontend/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@frontend/components/ui/table";
import { Loader } from "@frontend/components/ui/loader";
import { apiFetch } from "@frontend/lib/fetcher";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
}

interface Meta { page: number; pageSize: number; total: number; totalPages: number; }

interface Props<T> {
  endpoint: string;
  columns: Column<T>[];
  searchPlaceholder?: string;
  /** extra query params, e.g. status filter */
  filters?: Record<string, string>;
  toolbar?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  /** bump this number to force a reload (after create/edit/delete) */
  refreshKey?: number;
  /**
   * Called with each page of rows as it loads.
   *
   * Lets a screen act on what is currently displayed without owning the fetch:
   * counting attachments for the visible records, or exporting exactly the rows
   * on screen. Deliberately not part of the reload dependencies, so passing an
   * inline arrow here cannot cause a refetch loop.
   */
  onRows?: (rows: T[]) => void;
}

export function DataTable<T extends { id: string }>({
  endpoint, columns, searchPlaceholder, filters, toolbar, rowActions, refreshKey = 0, onRows,
}: Props<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const onRowsRef = useRef(onRows);
  onRowsRef.current = onRows;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q) params.set("q", q);
    for (const [k, v] of Object.entries(filters ?? {})) if (v) params.set(k, v);
    try {
      // apiFetch hits the backend origin with the bearer token and returns the
      // `data` payload directly (it also carries `meta` on the raw response).
      const body = await apiFetch<{ data?: T[]; meta?: Meta }>(
        `${endpoint}?${params}`,
        { returnRaw: true },
      );
      setRows(body.data ?? []);
      onRowsRef.current?.(body.data ?? []);
      if (body.meta) setMeta(body.meta);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, q, filters]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const colCount = columns.length + (rowActions ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder ?? "Search..."}
            className="h-10 pl-9"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card card-sheen">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {columns.map((c) => <TableHead key={c.key} className="h-11 bg-elevated/50 text-[11px] uppercase tracking-wider">{c.header}</TableHead>)}
              {rowActions && <TableHead className="h-11 bg-elevated/50 text-right text-[11px] uppercase tracking-wider">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="h-40">
                  <Loader size={36} label="Loading…" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-7 w-7 opacity-40" />
                    <span className="text-sm">No results</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="border-border/70 transition-colors hover:bg-elevated/60">
                  {columns.map((c) => (
                    <TableCell key={c.key} className="py-3.5">
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </TableCell>
                  ))}
                  {rowActions && <TableCell className="py-3.5 text-right">{rowActions(row)}</TableCell>}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{meta.total} {meta.total === 1 ? "record" : "records"}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="tabular-nums">{meta.page} / {meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
