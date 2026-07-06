"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, Send, CheckCircle2, XCircle, BookText } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { EXPENSE_STATUS_LABEL, EXPENSE_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { ExpenseClaimStatus } from "@frontend/lib/enums";

type Driver = { id: string; name: string };
type Advance = { id: string; reference: string; amount: string; type: string; driver: { name: string } | null };

interface ClaimRow {
  id: string; claimNumber: string; title: string; currency: string; total: string;
  status: ExpenseClaimStatus; driver: { name: string } | null; _count: { lines: number };
}

type LineDraft = { expenseCode: string; description: string; amount: string; incurredAt: string; receiptUrl: string };
const emptyLine = (): LineDraft => ({ expenseCode: "5030", description: "", amount: "", incurredAt: new Date().toISOString().slice(0, 10), receiptUrl: "" });
const money = (v: string, c = "USD") => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function ExpensesManager({ drivers, advances }: { drivers: Driver[]; advances: Advance[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [driverId, setDriverId] = useState("");
  const [title, setTitle] = useState("");
  const [advanceId, setAdvanceId] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setDriverId(""); setTitle(""); setAdvanceId(""); setLines([emptyLine()]);
    setCreateOpen(true);
  }
  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const advance = advances.find((a) => a.id === advanceId);

  async function submit() {
    setBusy(true);
    try {
      const payload = {
        driverId: driverId || null,
        title,
        advanceId: advanceId || null,
        lines: lines.filter((l) => l.description && Number(l.amount) > 0).map((l) => ({
          expenseCode: l.expenseCode, description: l.description, amount: Number(l.amount),
          incurredAt: l.incurredAt, receiptUrl: l.receiptUrl || null,
        })),
      };
      if (!payload.title) throw new ApiError("Title is required", 422);
      if (payload.lines.length === 0) throw new ApiError("Add at least one line", 422);
      await apiFetch("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Claim created", variant: "success" });
      setCreateOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const columns: Column<ClaimRow>[] = [
    { key: "claimNumber", header: "Claim", render: (r) => <span className="font-mono">{r.claimNumber}</span> },
    { key: "title", header: "Title" },
    { key: "driver", header: "Driver", render: (r) => r.driver?.name ?? "—" },
    { key: "total", header: "Total", render: (r) => <span className="tabular-nums">{money(r.total, r.currency)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={EXPENSE_STATUS_VARIANT[r.status]}>{EXPENSE_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<ClaimRow>
        endpoint="/api/expenses"
        columns={columns}
        searchPlaceholder="Search by claim no. or title"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Claim</Button>}
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>Open</Button>}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New Expense Claim</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2"><Label>Title</Label><Input placeholder="Trip TRP-00012 cash sheet" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Driver</Label>
                <Select value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label>Reconcile against advance (optional)</Label>
                <Select value={advanceId || "none"} onValueChange={(v) => setAdvanceId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No advance" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No advance —</SelectItem>
                    {advances.map((a) => <SelectItem key={a.id} value={a.id}>{a.reference} · {money(a.amount)} · {a.driver?.name ?? a.type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Expense lines</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus className="h-3.5 w-3.5" />Add line</Button>
              </div>
              {lines.map((l, i) => <LineRow key={i} line={l} onChange={(p) => setLine(i, p)} onRemove={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} />)}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Claim total: <span className="font-semibold text-foreground tabular-nums">{money(String(total))}</span></span>
                {advance && (
                  <span className="text-muted-foreground">
                    vs advance {money(advance.amount)} →{" "}
                    <span className={total - Number(advance.amount) >= 0 ? "text-amber-400" : "text-emerald-400"}>
                      {total - Number(advance.amount) >= 0 ? `top-up ${money(String(total - Number(advance.amount)))}` : `driver returns ${money(String(Number(advance.amount) - total))}`}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailId && <ClaimDetail id={detailId} onClose={() => setDetailId(null)} onChange={() => setRefreshKey((k) => k + 1)} />}
    </>
  );
}

function LineRow({ line, onChange, onRemove }: { line: LineDraft; onChange: (p: Partial<LineDraft>) => void; onRemove: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch<{ url: string }>("/api/uploads", { method: "POST", body: fd });
      onChange({ receiptUrl: res.url });
      toast({ title: "Receipt attached", variant: "success" });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setUploading(false); }
  }

  return (
    <div className="grid grid-cols-12 gap-2 rounded-md border p-2">
      <Input className="col-span-2" placeholder="Acct" value={line.expenseCode} onChange={(e) => onChange({ expenseCode: e.target.value })} />
      <Input className="col-span-4" placeholder="Description" value={line.description} onChange={(e) => onChange({ description: e.target.value })} />
      <Input className="col-span-2" type="number" step="0.01" placeholder="Amount" value={line.amount} onChange={(e) => onChange({ amount: e.target.value })} />
      <Input className="col-span-2" type="date" value={line.incurredAt} onChange={(e) => onChange({ incurredAt: e.target.value })} />
      <div className="col-span-1 flex items-center justify-center">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" title={line.receiptUrl ? "Receipt attached" : "Attach receipt"} className={line.receiptUrl ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"} onClick={() => fileRef.current?.click()}>
          <Upload className={`h-4 w-4 ${uploading ? "animate-pulse" : ""}`} />
        </button>
      </div>
      <button type="button" className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-destructive" onClick={onRemove}><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

type ClaimDetailData = {
  id: string; claimNumber: string; title: string; currency: string; total: string; status: ExpenseClaimStatus;
  advanceAmount: string; reconciled: string;
  driver: { name: string } | null;
  advance: { reference: string; amount: string; type: string } | null;
  lines: { id: string; expenseCode: string; description: string; amount: string; incurredAt: string; receiptUrl: string | null }[];
};

function ClaimDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [claim, setClaim] = useState<ClaimDetailData | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setClaim(await apiFetch<ClaimDetailData>(`/api/expenses/${id}`)); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function act(path: string, label: string, body?: unknown) {
    setBusy(true);
    try {
      await apiFetch(`/api/expenses/${id}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      toast({ title: label, variant: "success" });
      onChange();
      await load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const money2 = (v: string, c = claim?.currency) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{claim ? `${claim.claimNumber} — ${claim.title}` : "Loading…"}</DialogTitle></DialogHeader>
        {claim && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {claim.driver && <span className="text-muted-foreground">Driver: <span className="font-medium text-foreground">{claim.driver.name}</span></span>}
              <Badge variant={EXPENSE_STATUS_VARIANT[claim.status]}>{EXPENSE_STATUS_LABEL[claim.status]}</Badge>
              {claim.advance && <span className="text-muted-foreground">Advance: {money2(claim.advance.amount)}</span>}
              <span className="ml-auto font-semibold tabular-nums">{money2(claim.total)}</span>
            </div>

            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-elevated/50 text-[11px] uppercase text-muted-foreground">
                  <tr><th className="p-2 text-left">Acct</th><th className="p-2 text-left">Description</th><th className="p-2 text-right">Amount</th><th className="p-2 text-center">Receipt</th></tr>
                </thead>
                <tbody>
                  {claim.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2 font-mono text-xs">{l.expenseCode}</td>
                      <td className="p-2">{l.description}</td>
                      <td className="p-2 text-right tabular-nums">{parseFloat(l.amount).toFixed(2)}</td>
                      <td className="p-2 text-center">{l.receiptUrl ? <a href={l.receiptUrl} target="_blank" rel="noreferrer" className="text-primary underline">view</a> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {claim.status === "POSTED" && (
              <p className="text-sm text-muted-foreground">
                Reconciled: <span className={Number(claim.reconciled) >= 0 ? "text-amber-400" : "text-emerald-400"}>
                  {Number(claim.reconciled) >= 0 ? `${money2(claim.reconciled)} owed to driver` : `${money2(String(Math.abs(Number(claim.reconciled))))} returned by driver`}
                </span>
              </p>
            )}

            <DialogFooter className="gap-2">
              {claim.status === "DRAFT" && <Button variant="outline" disabled={busy} onClick={() => act("submit", "Submitted")}><Send className="h-4 w-4" />Submit</Button>}
              {claim.status === "SUBMITTED" && (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => act("review", "Rejected", { approve: false })}><XCircle className="h-4 w-4" />Reject</Button>
                  <Button variant="outline" disabled={busy} onClick={() => act("review", "Approved", { approve: true })}><CheckCircle2 className="h-4 w-4" />Approve</Button>
                </>
              )}
              {claim.status === "APPROVED" && <Button disabled={busy} onClick={() => act("post", "Posted to ledger")}><BookText className="h-4 w-4" />Post</Button>}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
