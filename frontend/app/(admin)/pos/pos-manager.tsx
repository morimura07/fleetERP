"use client";
import { useState } from "react";
import { Plus, Trash2, Check, Ban } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { POS_STATUS_LABEL, POS_STATUS_VARIANT, POS_PAYMENT_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { PosSaleStatus, PosPaymentMethod } from "@frontend/lib/enums";

type Item = { id: string; code: string; name: string; unit: string; quantityOnHand: string; avgCost: string };
type BasketLine = { stockItemId: string; quantity: string; unitPrice: string };

interface SaleRow {
  id: string; saleNumber: string; status: PosSaleStatus; paymentMethod: PosPaymentMethod;
  customerName: string | null; currency: string; total: string; cogs: string; _count: { lines: number };
}

const PAYMENTS: PosPaymentMethod[] = ["CASH", "MOBILE_MONEY", "CARD"];
const money = (v: string, c: string) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function PosManager({ items }: { items: Item[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("CASH");
  const [currency, setCurrency] = useState("USD");
  const [taxAmount, setTaxAmount] = useState("0");
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [pickId, setPickId] = useState("");

  const refresh = () => setRefreshKey((k) => k + 1);
  const itemById = (id: string) => items.find((i) => i.id === id);
  const subtotal = basket.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  const total = subtotal + (parseFloat(taxAmount) || 0);

  function openCreate() {
    setCustomerName(""); setPaymentMethod("CASH"); setCurrency("USD"); setTaxAmount("0");
    setBasket([]); setPickId("");
    setOpen(true);
  }
  function addToBasket() {
    if (!pickId) return;
    if (basket.some((l) => l.stockItemId === pickId)) { toast({ title: "Already in basket" }); return; }
    setBasket((b) => [...b, { stockItemId: pickId, quantity: "1", unitPrice: "0" }]);
    setPickId("");
  }
  const setLine = (i: number, patch: Partial<BasketLine>) => setBasket((b) => b.map((l, j) => j === i ? { ...l, ...patch } : l));
  const removeLine = (i: number) => setBasket((b) => b.filter((_, j) => j !== i));

  async function submit() {
    setBusy(true);
    try {
      if (basket.length === 0) throw new ApiError("Add at least one item", 422);
      await apiFetch("/api/pos", {
        method: "POST",
        body: JSON.stringify({
          customerName: customerName || null, paymentMethod, currency,
          taxAmount: Number(taxAmount) || 0,
          lines: basket.map((l) => ({ stockItemId: l.stockItemId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
        }),
      });
      toast({ title: "Sale created (draft)", variant: "success" });
      setOpen(false); refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function complete(id: string) {
    try {
      await apiFetch(`/api/pos/${id}/complete`, { method: "POST" });
      toast({ title: "Sale completed — posted to ledger", variant: "success" });
      refresh();
    } catch (e) {
      toast({ title: "Cannot complete", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }
  async function voidSale(id: string) {
    try {
      await apiFetch(`/api/pos/${id}/void`, { method: "POST" });
      toast({ title: "Sale voided", variant: "success" });
      refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<SaleRow>[] = [
    { key: "saleNumber", header: "Sale", render: (r) => <span className="font-mono">{r.saleNumber}</span> },
    { key: "customerName", header: "Customer", render: (r) => r.customerName || <span className="text-muted-foreground">Walk-in</span> },
    { key: "paymentMethod", header: "Payment", render: (r) => POS_PAYMENT_LABEL[r.paymentMethod] },
    { key: "lines", header: "Items", render: (r) => <span className="tabular-nums">{r._count.lines}</span> },
    { key: "total", header: "Total", render: (r) => <span className="tabular-nums">{money(r.total, r.currency)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={POS_STATUS_VARIANT[r.status]}>{POS_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<SaleRow>
        endpoint="/api/pos"
        columns={columns}
        searchPlaceholder="Search sale no. or customer"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Sale</Button>}
        rowActions={(r) => (
          <div className="flex items-center gap-1.5">
            {r.status === "DRAFT" && <Button variant="outline" size="sm" onClick={() => complete(r.id)}><Check className="h-3.5 w-3.5" />Complete</Button>}
            {r.status !== "VOID" && <Button variant="ghost" size="sm" onClick={() => voidSale(r.id)}><Ban className="h-3.5 w-3.5" />Void</Button>}
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Sale</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5"><Label>Customer <span className="text-muted-foreground">(optional)</span></Label><Input placeholder="Walk-in" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Payment</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PosPaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENTS.map((p) => <SelectItem key={p} value={p}>{POS_PAYMENT_LABEL[p]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} /></div>
            </div>

            {/* Item picker */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label>Add Item</Label>
                <Select value={pickId} onValueChange={setPickId}>
                  <SelectTrigger><SelectValue placeholder="Select a stock item" /></SelectTrigger>
                  <SelectContent>
                    {items.length === 0 && <SelectItem value="none" disabled>No stock items</SelectItem>}
                    {items.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.code} · {i.name} <span className="text-muted-foreground">({parseFloat(i.quantityOnHand)} {i.unit})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={addToBasket} disabled={!pickId}><Plus className="h-4 w-4" />Add</Button>
            </div>

            {/* Basket */}
            {basket.length > 0 && (
              <div className="space-y-2">
                {basket.map((l, i) => {
                  const it = itemById(l.stockItemId);
                  const onHand = it ? parseFloat(it.quantityOnHand) : 0;
                  const over = (parseFloat(l.quantity) || 0) > onHand;
                  return (
                    <div key={l.stockItemId} className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">{it?.code} · {it?.name}</Label>
                        <div className="text-[11px] text-muted-foreground">On hand: {onHand} {it?.unit} · avg cost {it?.avgCost}</div>
                      </div>
                      <div className="w-20 space-y-1"><Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input type="number" step="0.001" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={over ? "border-destructive" : ""} /></div>
                      <div className="w-28 space-y-1"><Label className="text-xs text-muted-foreground">Unit Price</Label>
                        <Input type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></div>
                      <div className="w-28 space-y-1"><Label className="text-xs text-muted-foreground">Line</Label>
                        <div className="flex h-9 items-center justify-end px-2 text-sm tabular-nums text-muted-foreground">
                          {((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0)).toFixed(2)}
                        </div></div>
                      <Button type="button" variant="ghost" size="icon" className="mb-0.5" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-end gap-4">
              <div className="w-40 space-y-1"><Label className="text-xs text-muted-foreground">Tax</Label>
                <Input type="number" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} /></div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-lg font-bold tabular-nums">{currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Creates a draft. Use <b>Complete</b> in the list to relieve stock and post to the ledger.</p>
            <DialogFooter><Button onClick={submit} disabled={busy || basket.length === 0}>Create Sale</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
