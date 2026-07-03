"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle2, PackageCheck, Scale } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { PO_STATUS_LABEL, PO_STATUS_VARIANT, MATCH_STATUS_LABEL, MATCH_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { PurchaseOrderStatus, MatchStatus } from "@frontend/lib/enums";

type Vendor = { id: string; code: string; legalName: string; currency: string };
type Item = { id: string; code: string; name: string; unit: string; expenseCode: string };

interface PORow {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  matchStatus: MatchStatus;
  currency: string;
  subtotal: string;
  orderDate: string;
  vendor: { legalName: string };
  _count: { lines: number };
}

type LineDraft = { stockItemId: string; description: string; quantity: string; unitPrice: string; expenseCode: string };

const emptyLine = (): LineDraft => ({ stockItemId: "", description: "", quantity: "", unitPrice: "", expenseCode: "5100" });
const money = (v: string, c = "USD") => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function ProcurementManager({ vendors, items }: { vendors: Vendor[]; items: Item[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // New PO form
  const [vendorId, setVendorId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setVendorId(""); setCurrency("USD"); setOrderDate(new Date().toISOString().slice(0, 10));
    setLines([emptyLine()]);
    setCreateOpen(true);
  }

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function onPickItem(i: number, itemId: string) {
    const it = items.find((x) => x.id === itemId);
    setLines((ls) => ls.map((l, idx) => (idx === i ? {
      ...l, stockItemId: itemId,
      description: it ? `${it.code} — ${it.name}` : l.description,
      expenseCode: it?.expenseCode ?? l.expenseCode,
    } : l)));
  }

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  async function submit() {
    setBusy(true);
    try {
      const payload = {
        vendorId, currency, orderDate,
        lines: lines
          .filter((l) => l.description && Number(l.quantity) > 0)
          .map((l) => ({
            stockItemId: l.stockItemId || null,
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            expenseCode: l.expenseCode,
          })),
      };
      if (!payload.vendorId) throw new ApiError("Select a vendor", 422);
      if (payload.lines.length === 0) throw new ApiError("Add at least one line", 422);
      await apiFetch("/api/procurement", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Purchase order created", variant: "success" });
      setCreateOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<PORow>[] = [
    { key: "poNumber", header: "PO No.", render: (r) => <span className="font-mono">{r.poNumber}</span> },
    { key: "vendor", header: "Vendor", render: (r) => r.vendor.legalName },
    { key: "_count", header: "Lines", render: (r) => r._count.lines },
    { key: "subtotal", header: "Subtotal", render: (r) => <span className="tabular-nums">{money(r.subtotal, r.currency)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={PO_STATUS_VARIANT[r.status]}>{PO_STATUS_LABEL[r.status]}</Badge> },
    { key: "matchStatus", header: "Match", render: (r) => <Badge variant={MATCH_STATUS_VARIANT[r.matchStatus]}>{MATCH_STATUS_LABEL[r.matchStatus]}</Badge> },
  ];

  return (
    <>
      <DataTable<PORow>
        endpoint="/api/procurement"
        columns={columns}
        searchPlaceholder="Search by PO no. or vendor"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New PO</Button>}
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>Open</Button>}
      />

      {/* New PO dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Select value={vendorId} onValueChange={(v) => { setVendorId(v); const ven = vendors.find((x) => x.id === v); if (ven) setCurrency(ven.currency); }}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.legalName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></div>
              <div className="space-y-1.5"><Label>Order Date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Lines</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus className="h-3.5 w-3.5" />Add line</Button>
              </div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 rounded-md border p-2">
                  <div className="col-span-3">
                    <Select value={l.stockItemId || "none"} onValueChange={(v) => onPickItem(i, v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Item (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Non-stock —</SelectItem>
                        {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input className="col-span-4" placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <Input className="col-span-2" type="number" step="0.001" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <Input className="col-span-2" type="number" step="0.0001" placeholder="Unit price" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                  <button type="button" className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-destructive" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="text-right text-sm text-muted-foreground">Subtotal: <span className="font-semibold text-foreground tabular-nums">{money(String(total), currency)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>Create PO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PO detail + lifecycle actions */}
      {detailId && (
        <PODetail
          id={detailId}
          onClose={() => setDetailId(null)}
          onChange={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}

type PODetailData = {
  id: string; poNumber: string; status: PurchaseOrderStatus; matchStatus: MatchStatus; currency: string; subtotal: string;
  vendor: { legalName: string; code: string };
  vendorInvoice: { invoiceNumber: string; subtotal: string } | null;
  lines: { id: string; description: string; quantity: string; qtyReceived: string; unitPrice: string; lineTotal: string; stockItem: { code: string; unit: string } | null }[];
};

function PODetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [po, setPo] = useState<PODetailData | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setPo(await apiFetch<PODetailData>(`/api/procurement/${id}`)); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
  }
  // load on mount
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function act(path: string, body?: unknown, label = "Done") {
    setBusy(true);
    try {
      const res = await apiFetch<{ status?: string; variances?: unknown[] }>(`/api/procurement/${id}/${path}`, {
        method: "POST", body: body ? JSON.stringify(body) : undefined,
      });
      if (path === "match") {
        toast({ title: res.status === "MATCHED" ? "Matched ✓" : "Variance found", variant: res.status === "MATCHED" ? "success" : "destructive" });
      } else {
        toast({ title: label, variant: "success" });
      }
      onChange();
      await load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function receiveAll() {
    if (!po) return;
    const lines = po.lines
      .map((l) => ({ purchaseOrderLineId: l.id, quantity: Number(l.quantity) - Number(l.qtyReceived) }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) { toast({ title: "Nothing outstanding to receive" }); return; }
    await act("receive", { lines }, "Goods received");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{po ? po.poNumber : "Loading…"}</DialogTitle></DialogHeader>
        {po && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">Vendor: <span className="font-medium text-foreground">{po.vendor.legalName}</span></span>
              <Badge variant={PO_STATUS_VARIANT[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
              <Badge variant={MATCH_STATUS_VARIANT[po.matchStatus]}>{MATCH_STATUS_LABEL[po.matchStatus]}</Badge>
              <span className="ml-auto font-semibold tabular-nums">{money(po.subtotal, po.currency)}</span>
            </div>

            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-elevated/50 text-[11px] uppercase text-muted-foreground">
                  <tr><th className="p-2 text-left">Description</th><th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Unit</th><th className="p-2 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {po.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">{l.description}</td>
                      <td className="p-2 text-right tabular-nums">{parseFloat(l.quantity)}</td>
                      <td className="p-2 text-right tabular-nums">{parseFloat(l.qtyReceived)}</td>
                      <td className="p-2 text-right tabular-nums">{parseFloat(l.unitPrice)}</td>
                      <td className="p-2 text-right tabular-nums">{parseFloat(l.lineTotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Match against a vendor invoice */}
            {(po.status === "RECEIVED" || po.status === "PARTIAL") && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>Vendor Invoice ID (for 3-way match)</Label>
                  <Input placeholder="paste vendor invoice id" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
                </div>
                <Button variant="outline" disabled={busy || !invoiceId} onClick={() => act("match", { vendorInvoiceId: invoiceId })}>
                  <Scale className="h-4 w-4" />Match
                </Button>
              </div>
            )}

            <DialogFooter className="gap-2">
              {po.status === "DRAFT" && (
                <Button variant="outline" disabled={busy} onClick={() => act("approve", undefined, "Approved")}><CheckCircle2 className="h-4 w-4" />Approve</Button>
              )}
              {(po.status === "APPROVED" || po.status === "PARTIAL") && (
                <Button disabled={busy} onClick={receiveAll}><PackageCheck className="h-4 w-4" />Receive all</Button>
              )}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
