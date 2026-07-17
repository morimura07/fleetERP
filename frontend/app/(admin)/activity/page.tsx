"use client";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { formatDate } from "@frontend/lib/utils";

interface Log {
  id: string; action: string; target: string; ipAddress: string | null; createdAt: string;
  detail: string | null;
  user: { name: string; email: string } | null;
}

interface FieldChange { field: string; old: unknown; new: unknown; }

/** Parse the `detail` blob into field changes when it's a structured diff. */
function parseChanges(detail: string | null): FieldChange[] | null {
  if (!detail) return null;
  try {
    const obj = JSON.parse(detail);
    if (obj && Array.isArray(obj.changes)) return obj.changes as FieldChange[];
  } catch { /* not JSON — a plain note */ }
  return null;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "∅";
  return String(v);
}

function DetailCell({ detail }: { detail: string | null }) {
  const changes = parseChanges(detail);
  if (changes) {
    if (changes.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-col gap-1">
        {changes.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-foreground">{c.field}</span>
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive line-through">{fmt(c.old)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-500">{fmt(c.new)}</span>
          </div>
        ))}
      </div>
    );
  }
  // Non-diff detail: show the raw note/string if short, else dash.
  if (!detail) return <span className="text-muted-foreground">—</span>;
  return <span className="text-xs text-muted-foreground">{detail.length > 80 ? detail.slice(0, 80) + "…" : detail}</span>;
}

export default function ActivityPage() {
  const columns: Column<Log>[] = [
    { key: "createdAt", header: "Time", render: (r) => formatDate(r.createdAt, true) },
    { key: "user", header: "User", render: (r) => r.user?.name ?? "—" },
    { key: "action", header: "Action" },
    { key: "target", header: "Target", render: (r) => <span className="font-mono text-xs">{r.target}</span> },
    { key: "detail", header: "Changes", render: (r) => <DetailCell detail={r.detail} /> },
    { key: "ipAddress", header: "IP", render: (r) => r.ipAddress ?? "—" },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
      <DataTable<Log> endpoint="/api/activity" columns={columns} searchPlaceholder="" />
    </div>
  );
}
