"use client";
import { useCallback, useEffect, useState } from "react";
import { Send, CheckCircle2, XCircle, Pencil, Ban, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { AttachmentsPanel } from "@frontend/components/data/attachments-panel";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import {
  type ItemOpt, type RequisitionDetail as Detail, STATUS_LABEL, STATUS_VARIANT, BUDGET_LABEL, DECISION_VARIANT, money, when,
} from "./shared";
import { RequisitionForm } from "./requisition-form";

/**
 * One requisition: header, lines, the budget gate's finding, the approval
 * trail (every trip through the matrix, including superseded ones), the
 * documents, and the action that fits its status.
 */
export function RequisitionDetailDialog({ id, items, onClose, onChange }: { id: string; items: ItemOpt[]; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);
  const [r, setR] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try { setR(await apiFetch<Detail>(`/api/requisitions/${id}`)); } catch (e) { fail(e); }
  }, [id, fail]);
  useEffect(() => { load(); }, [load]);

  async function act(path: string, label: string, body?: unknown) {
    setBusy(true);
    try {
      const updated = await apiFetch<Detail>(`/api/requisitions/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      setR(updated); setNote("");
      toast({ title: label, description: `Now ${STATUS_LABEL[updated.status].toLowerCase()}`, variant: "success" });
      onChange();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  if (!r) return null;
  const pending = r.approvals.find((a) => a.status === "PENDING");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{r.prNumber}</span> {r.title}
            <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Fact label="Department" value={r.department ?? "-"} />
            <Fact label="Cost centre" value={r.costCenter ?? "-"} />
            <Fact label="Needed by" value={r.neededBy?.slice(0, 10) ?? "-"} />
            <Fact label="Estimate" value={money(r.subtotal, r.currency)} hint={r.amountBase ? `${money(r.amountBase, r.baseCurrency ?? "")} for the tier` : undefined} />
            <Fact label="Submitted" value={when(r.submittedAt) || "-"} />
            <Fact label="Reviewed" value={when(r.reviewedAt) || "-"} hint={r.reviewNote ?? undefined} />
            <Fact label="Budget" value={BUDGET_LABEL[r.budgetStatus]} hint={r.budgetNote ?? r.budgetOverrideNote ?? undefined} tone={r.budgetStatus === "HARD_BLOCK" ? "danger" : r.budgetStatus === "SOFT_BLOCK" ? "warn" : undefined} />
            <Fact label="Approved" value={when(r.approvedAt) || (r.rejectedReason ? `Rejected: ${r.rejectedReason}` : "-")} />
          </div>
          {r.justification && <p className="text-sm text-muted-foreground">{r.justification}</p>}

          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-muted-foreground">
                <tr><th className="p-2 text-left">Description</th><th className="p-2 text-left">UOM</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Est. price</th><th className="p-2 text-left">Account</th><th className="p-2 text-right">Total</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {r.lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2">{l.description}{l.specification && <div className="text-xs text-muted-foreground">{l.specification}</div>}</td>
                    <td className="p-2">{l.uom}</td>
                    <td className="p-2 text-right">{Number(l.quantity)}</td>
                    <td className="p-2 text-right">{Number(l.estUnitPrice).toLocaleString()}</td>
                    <td className="p-2 font-mono text-xs">{l.expenseCode}</td>
                    <td className="p-2 text-right">{money(l.lineTotal, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {r.approvals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Approval trail</h4>
              {r.approvals.map((a) => (
                <div key={a.id} className={`rounded-md border p-3 text-sm ${a.status === "SUPERSEDED" ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.tierName}</span>
                    <Badge variant={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "destructive" : a.status === "PENDING" ? "info" : "secondary"}>{a.status.toLowerCase()}</Badge>
                    <span className="text-xs text-muted-foreground">{money(a.amountBase, a.baseCurrency)}{a.rate && Number(a.rate) !== 1 ? ` at ${Number(a.rate)}` : ""} · {a.reason} · {when(a.createdAt)}</span>
                    {a.tier && <span className="ml-auto text-xs text-muted-foreground">{a.tier.mode.toLowerCase()}, {a.tier.minSignatures} needed</span>}
                  </div>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {a.decisions.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 text-xs">
                        <Badge variant={DECISION_VARIANT[d.status]}>{d.status.toLowerCase()}</Badge>
                        <span className="font-mono">{d.roleKey}</span>
                        {d.userName && <span className="text-muted-foreground">{d.userName} · {when(d.decidedAt)}{d.note ? ` · ${d.note}` : ""}</span>}
                        {a.tier?.mode === "SEQUENTIAL" && <span className="text-muted-foreground">step {d.step}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <AttachmentsPanel entityType="Requisition" entityId={r.id} />

          {["PENDING_REVIEW", "PENDING_BUDGET", "PENDING_APPROVAL"].includes(r.status) && (
            <div className="space-y-1.5"><Label>Note (optional; required to override a budget)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {["DRAFT", "REJECTED"].includes(r.status) && <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</Button>}
            {r.status === "DRAFT" && <Button disabled={busy} onClick={() => act("submit", "Submitted for technical review")}><Send className="h-4 w-4" />Submit</Button>}
            {r.status === "PENDING_REVIEW" && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => act("review", "Sent back", { pass: false, note: note || "Failed technical review" })}><XCircle className="h-4 w-4" />Fail review</Button>
                <Button disabled={busy} onClick={() => act("review", "Review passed", { pass: true, note })}><CheckCircle2 className="h-4 w-4" />Pass review</Button>
              </>
            )}
            {r.status === "PENDING_BUDGET" && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => act("budget-recheck", "Budget re-checked")}><RefreshCw className="h-4 w-4" />Re-check budget</Button>
                <Button disabled={busy || note.length < 3} title="Finance Head only" onClick={() => act("budget-override", "Budget overridden", { note })}><ShieldCheck className="h-4 w-4" />Override budget</Button>
              </>
            )}
            {r.status === "PENDING_APPROVAL" && pending && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => act("decide", "Rejected", { approve: false, note })}><XCircle className="h-4 w-4" />Reject</Button>
                <Button disabled={busy} onClick={() => act("decide", "Approved", { approve: true, note })}><CheckCircle2 className="h-4 w-4" />Approve</Button>
              </>
            )}
            {!["ORDERED", "CANCELLED"].includes(r.status) && <Button variant="ghost" disabled={busy} onClick={() => act("cancel", "Cancelled", { reason: note })}><Ban className="h-4 w-4" />Cancel requisition</Button>}
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </div>
        {editing && <RequisitionForm items={items} initial={r} onClose={() => setEditing(false)} onSaved={(saved) => { setR(saved); onChange(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "danger" }) {
  const color = tone === "danger" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={color}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
