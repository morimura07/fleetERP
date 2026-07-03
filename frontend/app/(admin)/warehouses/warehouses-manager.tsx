"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, ArrowLeftRight, Boxes } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { warehouseSchema, type WarehouseInput } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

type Item = { id: string; code: string; name: string; unit: string };
type WH = { id: string; code: string; name: string };
interface Warehouse extends WarehouseInput { id: string; version: number; }
type Balance = { id: string; quantity: string; stockItem: { code: string; name: string; unit: string; avgCost: string; currency: string } };

const num = (v: string) => parseFloat(v).toLocaleString(undefined, { maximumFractionDigits: 3 });

export function WarehousesManager({ items, warehouses }: { items: Item[]; warehouses: WH[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [balancesFor, setBalancesFor] = useState<Warehouse | null>(null);
  const form = useForm<WarehouseInput>({ resolver: zodResolver(warehouseSchema) });

  function openCreate() {
    form.reset({ dataAreaId: "HQ01", code: "", name: "", location: "", isDefault: false, isActive: true });
    setOpen(true);
  }

  async function onCreate(data: WarehouseInput) {
    try {
      await apiFetch("/api/warehouses", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Warehouse saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<Warehouse>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "location", header: "Location", render: (r) => r.location || "—" },
    { key: "isDefault", header: "Default", render: (r) => (r.isDefault ? <Badge variant="info">Default</Badge> : "—") },
    { key: "isActive", header: "Status", render: (r) => (r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>) },
  ];

  return (
    <>
      <DataTable<Warehouse>
        endpoint="/api/warehouses"
        columns={columns}
        searchPlaceholder="Search by code or name"
        refreshKey={refreshKey}
        toolbar={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(true)}><ArrowLeftRight className="h-4 w-4" />Transfer</Button>
            <Button onClick={openCreate}><Plus className="h-4 w-4" />New Warehouse</Button>
          </div>
        }
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setBalancesFor(r)}><Boxes className="h-3.5 w-3.5" />Balances</Button>}
      />

      {/* New warehouse */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Warehouse</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Code</Label><Input placeholder="WH-DAR" {...form.register("code")} />{form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}</div>
              <div className="space-y-1.5"><Label>Name</Label><Input {...form.register("name")} />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
              <div className="space-y-1.5 md:col-span-2"><Label>Location</Label><Input placeholder="Dar es Salaam" {...form.register("location")} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("isDefault")} /> Set as the default warehouse (receipts land here)
            </label>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer */}
      {transferOpen && (
        <TransferDialog items={items} warehouses={warehouses} onClose={() => setTransferOpen(false)} onDone={() => { setTransferOpen(false); setRefreshKey((k) => k + 1); }} />
      )}

      {/* Balances */}
      {balancesFor && <BalancesDialog warehouse={balancesFor} onClose={() => setBalancesFor(null)} />}
    </>
  );
}

function TransferDialog({ items, warehouses, onClose, onDone }: { items: Item[]; warehouses: WH[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [stockItemId, setStockItemId] = useState("");
  const [fromWarehouseId, setFrom] = useState("");
  const [toWarehouseId, setTo] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await apiFetch("/api/warehouses/transfer", {
        method: "POST",
        body: JSON.stringify({ stockItemId, fromWarehouseId, toWarehouseId, quantity: Number(quantity) }),
      });
      toast({ title: "Stock transferred", variant: "success" });
      onDone();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const valid = stockItemId && fromWarehouseId && toWarehouseId && fromWarehouseId !== toWarehouseId && Number(quantity) > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Transfer Stock Between Warehouses</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={stockItemId} onValueChange={setStockItemId}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.code} — {i.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={fromWarehouseId} onValueChange={setFrom}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={toWarehouseId} onValueChange={setTo}>
                <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.code}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !valid}>Transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BalancesDialog({ warehouse, onClose }: { warehouse: { id: string; code: string; name: string }; onClose: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Balance[] | null>(null);

  useEffect(() => {
    apiFetch<Balance[]>(`/api/warehouses/${warehouse.id}/balances`)
      .then(setRows)
      .catch((e) => toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [warehouse.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Stock at {warehouse.code} — {warehouse.name}</DialogTitle></DialogHeader>
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stock at this warehouse.</p>
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-elevated/50 text-[11px] uppercase text-muted-foreground">
                <tr><th className="p-2 text-left">Item</th><th className="p-2 text-right">On Hand</th><th className="p-2 text-right">Value</th></tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="p-2">{b.stockItem.name} <span className="font-mono text-xs text-muted-foreground">{b.stockItem.code}</span></td>
                    <td className="p-2 text-right tabular-nums">{num(b.quantity)} {b.stockItem.unit}</td>
                    <td className="p-2 text-right tabular-nums">{b.stockItem.currency} {(parseFloat(b.quantity) * parseFloat(b.stockItem.avgCost)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
