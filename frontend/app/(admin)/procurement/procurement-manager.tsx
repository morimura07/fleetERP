"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PoDetail } from "./po-detail";
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
  const [costCenter, setCostCenter] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setVendorId(""); setCurrency("USD"); setOrderDate(new Date().toISOString().slice(0, 10)); setCostCenter("");
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
        vendorId, currency, orderDate, costCenter: costCenter || null,
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
              <div className="space-y-1.5"><Label>Cost centre</Label><Input placeholder="Budget cost centre" value={costCenter} onChange={(e) => setCostCenter(e.target.value)} /></div>
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
        <PoDetail
          id={detailId}
          onClose={() => setDetailId(null)}
          onChange={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
