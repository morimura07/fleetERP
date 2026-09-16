"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Inbox } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Badge } from "@frontend/components/ui/badge";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { type ApprovalRequest, DECISION_VARIANT, money, when } from "./shared";

/** What the signed-in person may sign now, across requisitions, awards and change orders. */
export function ApprovalQueue({ onChanged, onOpen }: { onChanged: () => void; onOpen: (subjectType: string, subjectId: string) => void }) {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);
  const [rows, setRows] = useState<ApprovalRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await apiFetch<ApprovalRequest[]>("/api/requisitions/approvals/queue")); } catch (e) { fail(e); setRows([]); }
  }, [fail]);
  useEffect(() => { load(); }, [load]);

  async function decide(r: ApprovalRequest, approve: boolean) {
    setBusy(r.id);
    try {
      await apiFetch(`/api/requisitions/approvals/${r.id}/decide`, { method: "POST", body: JSON.stringify({ approve, note: notes[r.id] || null }) });
      toast({ title: approve ? `${r.subjectRef} approved` : `${r.subjectRef} rejected`, variant: "success" });
      await load(); onChanged();
    } catch (e) { fail(e); }
    finally { setBusy(null); }
  }

  if (rows === null) return null;
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border p-10 text-muted-foreground">
        <Inbox className="h-7 w-7 opacity-40" />
        <span className="text-sm">Nothing is waiting for your signature.</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button type="button" className="font-mono underline-offset-2 hover:underline" onClick={() => onOpen(r.subjectType, r.subjectId)}>{r.subjectRef}</button>
            <Badge variant="secondary">{r.subjectType.toLowerCase().replace("_", " ")}</Badge>
            <span>{money(r.amount, r.currency)}</span>
            {r.currency !== r.baseCurrency && <span className="text-xs text-muted-foreground">= {money(r.amountBase, r.baseCurrency)}</span>}
            <span className="text-xs text-muted-foreground">· {r.tierName} · {r.reason} · {when(r.createdAt)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {r.decisions.map((d) => <span key={d.id} className="flex items-center gap-1"><Badge variant={DECISION_VARIANT[d.status]}>{d.status.toLowerCase()}</Badge><span className="font-mono">{d.roleKey}</span>{d.userName && <span className="text-muted-foreground">{d.userName}</span>}</span>)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input className="h-8 max-w-sm" placeholder="Note (optional)" value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
            <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => decide(r, false)}><XCircle className="h-4 w-4" />Reject</Button>
            <Button size="sm" disabled={busy === r.id} onClick={() => decide(r, true)}><CheckCircle2 className="h-4 w-4" />Approve</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
