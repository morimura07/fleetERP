"use client";
import { useState } from "react";
import { Bell, AlertTriangle, CalendarClock, XCircle } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import {
  DUNNING_LEVEL_LABEL, DUNNING_LEVEL_VARIANT, DISPUTE_STATUS_LABEL, DISPUTE_STATUS_VARIANT,
} from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { DunningLevel, DisputeStatus } from "@frontend/lib/enums";

interface InvoiceRow {
  id: string; invoiceNumber: string; currency: string; total: string; paidAmount: string; outstanding: string;
  dueDate: string | null; dunningLevel: DunningLevel; disputeStatus: DisputeStatus;
  promiseToPayDate: string | null;
  customer: { code: string; name: string };
}

const DUNNING_LEVELS = Object.keys(DUNNING_LEVEL_LABEL) as DunningLevel[];
const DISPUTE_STATUSES = Object.keys(DISPUTE_STATUS_LABEL) as DisputeStatus[];
const money = (v: string, c = "USD") => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

type ActionKind = "dunning" | "dispute" | "promise" | "writeoff" | null;

export function CollectionsManager() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [active, setActive] = useState<{ inv: InvoiceRow; kind: ActionKind }>({ inv: null as never, kind: null });

  const columns: Column<InvoiceRow>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
    { key: "customer", header: "Customer", render: (r) => <span>{r.customer.name} <span className="font-mono text-xs text-muted-foreground">{r.customer.code}</span></span> },
    { key: "dueDate", header: "Due", render: (r) => r.dueDate ? r.dueDate.slice(0, 10) : "—" },
    { key: "outstanding", header: "Outstanding", render: (r) => <span className="tabular-nums font-medium">{money(r.outstanding, r.currency)}</span> },
    { key: "dunningLevel", header: "Dunning", render: (r) => <Badge variant={DUNNING_LEVEL_VARIANT[r.dunningLevel]}>{DUNNING_LEVEL_LABEL[r.dunningLevel]}</Badge> },
    { key: "disputeStatus", header: "Dispute", render: (r) => r.disputeStatus === "NONE" ? <span className="text-muted-foreground">—</span> : <Badge variant={DISPUTE_STATUS_VARIANT[r.disputeStatus]}>{DISPUTE_STATUS_LABEL[r.disputeStatus]}</Badge> },
    { key: "promiseToPayDate", header: "Promise", render: (r) => r.promiseToPayDate ? r.promiseToPayDate.slice(0, 10) : "—" },
  ];

  return (
    <>
      <DataTable<InvoiceRow>
        endpoint="/api/collections/invoices"
        columns={columns}
        searchPlaceholder="Search by invoice or customer"
        refreshKey={refreshKey}
        rowActions={(r) => (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" title="Dunning" onClick={() => setActive({ inv: r, kind: "dunning" })}><Bell className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" title="Dispute" onClick={() => setActive({ inv: r, kind: "dispute" })}><AlertTriangle className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" title="Promise to pay" onClick={() => setActive({ inv: r, kind: "promise" })}><CalendarClock className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" title="Write off" onClick={() => setActive({ inv: r, kind: "writeoff" })}><XCircle className="h-4 w-4" /></Button>
          </div>
        )}
      />
      {active.kind && (
        <ActionDialog
          inv={active.inv}
          kind={active.kind}
          onClose={() => setActive({ inv: null as never, kind: null })}
          onDone={() => { setRefreshKey((k) => k + 1); setActive({ inv: null as never, kind: null }); }}
        />
      )}
    </>
  );
}

function ActionDialog({ inv, kind, onClose, onDone }: { inv: InvoiceRow; kind: ActionKind; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState<DunningLevel>(inv.dunningLevel === "NONE" ? "REMINDER" : inv.dunningLevel);
  const [status, setStatus] = useState<DisputeStatus>(inv.disputeStatus === "NONE" ? "OPEN" : inv.disputeStatus);
  const [disputedAmount, setDisputedAmount] = useState(inv.outstanding);
  const [promiseDate, setPromiseDate] = useState(new Date().toISOString().slice(0, 10));
  const [promiseAmount, setPromiseAmount] = useState(inv.outstanding);
  const [note, setNote] = useState("");

  async function run() {
    setBusy(true);
    try {
      if (kind === "dunning") {
        await apiFetch("/api/collections/dunning", { method: "POST", body: JSON.stringify({ invoiceId: inv.id, level, note: note || null }) });
      } else if (kind === "dispute") {
        await apiFetch("/api/collections/dispute", { method: "POST", body: JSON.stringify({ invoiceId: inv.id, status, disputedAmount: Number(disputedAmount), note: note || null }) });
      } else if (kind === "promise") {
        await apiFetch("/api/collections/promise", { method: "POST", body: JSON.stringify({ invoiceId: inv.id, promiseDate, promiseAmount: Number(promiseAmount), note: note || null }) });
      } else if (kind === "writeoff") {
        const res = await apiFetch<{ voucherNumber: string; writtenOff: string }>("/api/collections/write-off", { method: "POST", body: JSON.stringify({ invoiceId: inv.id, note: note || null }) });
        toast({ title: "Written off", description: `${money(res.writtenOff, inv.currency)} · voucher ${res.voucherNumber}`, variant: "success" });
        onDone(); return;
      }
      toast({ title: "Saved", variant: "success" });
      onDone();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const titles: Record<Exclude<ActionKind, null>, string> = {
    dunning: "Advance Dunning Level", dispute: "Raise / Update Dispute",
    promise: "Record Promise to Pay", writeoff: "Write Off as Bad Debt",
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{titles[kind!]}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {inv.invoiceNumber} · {inv.customer.name} · outstanding <span className="font-medium text-foreground">{money(inv.outstanding, inv.currency)}</span>
          </p>

          {kind === "dunning" && (
            <div className="space-y-1.5">
              <Label>Dunning Level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as DunningLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DUNNING_LEVELS.map((l) => <SelectItem key={l} value={l}>{DUNNING_LEVEL_LABEL[l]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          {kind === "dispute" && (
            <>
              <div className="space-y-1.5">
                <Label>Dispute Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as DisputeStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DISPUTE_STATUSES.filter((s) => s !== "NONE").map((s) => <SelectItem key={s} value={s}>{DISPUTE_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Disputed Amount</Label><Input inputMode="decimal" value={disputedAmount} onChange={(e) => setDisputedAmount(e.target.value)} /></div>
            </>
          )}

          {kind === "promise" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Promise Date</Label><Input type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Promise Amount</Label><Input inputMode="decimal" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} /></div>
            </div>
          )}

          {kind === "writeoff" && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
              This posts <b>Dr Bad Debt Expense / Cr Accounts Receivable</b> for the full outstanding {money(inv.outstanding, inv.currency)}, marks the invoice paid, and records the write-off. This cannot be undone (reverse the journal entry if needed).
            </p>
          )}

          <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={busy} variant={kind === "writeoff" ? "destructive" : "default"}>
            {kind === "writeoff" ? "Write off" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
