"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Badge } from "@frontend/components/ui/badge";
import { useToast } from "@frontend/components/ui/toast";
import { PERIOD_STATUS_LABEL, PERIOD_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { can, type Role } from "@frontend/lib/rbac";
import type { PeriodStatus } from "@frontend/lib/enums";

export interface PeriodView {
  year: number;
  month: number;
  label: string;
  status: PeriodStatus;
  closedAt: string | null;
  note: string | null;
}

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : null);

export function PeriodsManager({ initial }: { initial: PeriodView[] }) {
  const { toast } = useToast();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const canManage = can(role, "period:manage");

  const [periods, setPeriods] = useState<PeriodView[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(p: PeriodView, status: PeriodStatus) {
    if (status === "CLOSED" && !confirm(`Close ${MONTH_NAMES[p.month]} ${p.year}? New postings dated in this month will be blocked.`)) return;
    setBusy(p.label);
    try {
      await apiFetch("/api/fiscal-periods", { method: "POST", body: JSON.stringify({ year: p.year, month: p.month, status }) });
      toast({ title: status === "CLOSED" ? `${p.label} closed` : `${p.label} reopened`, variant: "success" });
      // Reflect the change locally without a full reload.
      setPeriods((rows) => rows.map((r) => (r.label === p.label ? { ...r, status, closedAt: status === "CLOSED" ? new Date().toISOString() : null } : r)));
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(null); }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Period</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Closed</th>
            {canManage && <th className="px-4 py-2.5 text-right font-medium">Action</th>}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.label} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <span className="font-medium text-foreground">{MONTH_NAMES[p.month]} {p.year}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{p.label}</span>
              </td>
              <td className="px-4 py-3">
                <Badge variant={PERIOD_STATUS_VARIANT[p.status]}>
                  {p.status === "CLOSED" ? <Lock className="mr-1 h-3 w-3" /> : <LockOpen className="mr-1 h-3 w-3" />}
                  {PERIOD_STATUS_LABEL[p.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(p.closedAt) ?? "—"}</td>
              {canManage && (
                <td className="px-4 py-3 text-right">
                  {p.status === "OPEN" ? (
                    <Button variant="outline" size="sm" disabled={busy === p.label} onClick={() => setStatus(p, "CLOSED")}>
                      <Lock className="h-3.5 w-3.5" />Close
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled={busy === p.label} onClick={() => setStatus(p, "OPEN")}>
                      <LockOpen className="h-3.5 w-3.5" />Reopen
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
