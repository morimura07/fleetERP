"use client";
import { useState } from "react";
import { Plus, Trash2, ArrowRightLeft } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { QuoteStatus } from "@frontend/lib/enums";

type Client = { id: string; companyName: string };
type Line = { description: string; quantity: string; unitPrice: string };

interface QuoteRow {
  id: string; quoteNumber: string; status: QuoteStatus; currency: string; total: string;
  validUntil: string; originZone: string | null; destinationZone: string | null;
  client: { companyName: string } | null;
  convertedOrder: { orderCode: string } | null;
  _count: { lines: number };
}

// Statuses a user can set by hand (CONVERTED is reached only via the convert action).
const SETTABLE: QuoteStatus[] = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];
const money = (v: string, c: string) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const emptyLine = (): Line => ({ description: "", quantity: "1", unitPrice: "0" });
const today30 = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };

export function QuotesManager({ clients }: { clients: Client[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);

  // Header fields + line items (local state; submitted as one payload).
  const [clientId, setClientId] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [originZone, setOriginZone] = useState("");
  const [destinationZone, setDestinationZone] = useState("");
  const [cargoDescription, setCargoDescription] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [validUntil, setValidUntil] = useState(today30());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const total = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);

  function openCreate() {
    setClientId(""); setSalesperson(""); setOriginZone(""); setDestinationZone("");
    setCargoDescription(""); setCurrency("USD"); setValidUntil(today30()); setNotes("");
    setLines([emptyLine()]);
    setOpen(true);
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (i: number) => setLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls);

  async function submit() {
    setBusy(true);
    try {
      const cleanLines = lines
        .filter((l) => l.description.trim())
        .map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }));
      if (cleanLines.length === 0) throw new ApiError("Add at least one line item", 422);
      await apiFetch("/api/sales/quotes", {
        method: "POST",
        body: JSON.stringify({
          clientId: clientId || null, salesperson: salesperson || null,
          originZone: originZone || null, destinationZone: destinationZone || null,
          cargoDescription: cargoDescription || null, currency, validUntil, notes: notes || null,
          lines: cleanLines,
        }),
      });
      toast({ title: "Quote created", variant: "success" });
      setOpen(false); refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function setStatus(id: string, status: QuoteStatus) {
    try {
      await apiFetch(`/api/sales/quotes/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast({ title: `Marked ${QUOTE_STATUS_LABEL[status]}`, variant: "success" });
      refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  async function convert(id: string) {
    try {
      const order = await apiFetch<{ orderCode: string }>(`/api/sales/quotes/${id}/convert`, { method: "POST" });
      toast({ title: `Converted → order ${order.orderCode}`, variant: "success" });
      refresh();
    } catch (e) {
      toast({ title: "Convert failed", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<QuoteRow>[] = [
    { key: "quoteNumber", header: "Quote", render: (r) => <span className="font-mono">{r.quoteNumber}</span> },
    { key: "client", header: "Client", render: (r) => r.client?.companyName ?? "—" },
    { key: "route", header: "Route", render: (r) => (r.originZone && r.destinationZone) ? <span className="text-xs">{r.originZone} → {r.destinationZone}</span> : "—" },
    { key: "total", header: "Total", render: (r) => <span className="tabular-nums">{money(r.total, r.currency)}</span> },
    { key: "validUntil", header: "Valid Until", render: (r) => <span className="text-xs">{day(r.validUntil)}</span> },
    { key: "status", header: "Status", render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        <Badge variant={QUOTE_STATUS_VARIANT[r.status]}>{QUOTE_STATUS_LABEL[r.status]}</Badge>
        {r.convertedOrder && <span className="font-mono text-[11px] text-muted-foreground">{r.convertedOrder.orderCode}</span>}
      </span>
    ) },
  ];

  return (
    <>
      <DataTable<QuoteRow>
        endpoint="/api/sales/quotes"
        columns={columns}
        searchPlaceholder="Search quote no. or cargo"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Quote</Button>}
        rowActions={(r) => (
          <div className="flex items-center gap-1.5">
            {r.status === "ACCEPTED" && (
              <Button variant="outline" size="sm" onClick={() => convert(r.id)}>
                <ArrowRightLeft className="h-3.5 w-3.5" />Convert
              </Button>
            )}
            {r.status !== "CONVERTED" && (
              <Select value={r.status} onValueChange={(v) => setStatus(r.id, v as QuoteStatus)}>
                <SelectTrigger className="h-8 w-[8.5rem]"><SelectValue /></SelectTrigger>
                <SelectContent>{SETTABLE.map((s) => <SelectItem key={s} value={s}>{QUOTE_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Quote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Salesperson</Label><Input value={salesperson} onChange={(e) => setSalesperson(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Origin</Label><Input placeholder="Dar es Salaam Port" value={originZone} onChange={(e) => setOriginZone(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Destination</Label><Input placeholder="Kigali Depot" value={destinationZone} onChange={(e) => setDestinationZone(e.target.value)} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Cargo Description</Label><Input value={cargoDescription} onChange={(e) => setCargoDescription(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Valid Until</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="h-3.5 w-3.5" />Add line</Button>
              </div>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1"><Label className="text-xs text-muted-foreground">Description</Label>
                      <Input placeholder="Freight — 40ft container" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></div>
                    <div className="w-20 space-y-1"><Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input type="number" step="0.01" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></div>
                    <div className="w-28 space-y-1"><Label className="text-xs text-muted-foreground">Unit Price</Label>
                      <Input type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></div>
                    <div className="w-28 space-y-1"><Label className="text-xs text-muted-foreground">Amount</Label>
                      <div className="flex h-9 items-center justify-end px-2 text-sm tabular-nums text-muted-foreground">
                        {((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0)).toFixed(2)}
                      </div></div>
                    <Button type="button" variant="ghost" size="icon" className="mb-0.5" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-1 text-sm font-semibold">
                Total:&nbsp;<span className="tabular-nums">{currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

            <DialogFooter><Button onClick={submit} disabled={busy}>Create Quote</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
