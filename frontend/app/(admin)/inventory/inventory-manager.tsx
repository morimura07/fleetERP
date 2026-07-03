"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { stockItemSchema, type StockItemInput } from "@frontend/lib/validations";
import { STOCK_CATEGORY_LABEL, STOCK_UNIT_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { StockCategory, StockUnit } from "@frontend/lib/enums";

interface StockItem extends StockItemInput {
  id: string;
  version: number;
  quantityOnHand: string;
  avgCost: string;
  value: string;
  low: boolean;
}

const CATEGORIES = Object.keys(STOCK_CATEGORY_LABEL) as StockCategory[];
const UNITS = Object.keys(STOCK_UNIT_LABEL) as StockUnit[];

const num = (v: string) => parseFloat(v).toLocaleString(undefined, { maximumFractionDigits: 3 });

export function InventoryManager() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [itemOpen, setItemOpen] = useState(false);
  const [move, setMove] = useState<{ item: StockItem; type: "RECEIPT" | "ISSUE" } | null>(null);

  const form = useForm<StockItemInput>({ resolver: zodResolver(stockItemSchema) });

  function openCreate() {
    form.reset({
      dataAreaId: "HQ01", code: "", name: "", category: "SPARE_PART", unit: "PIECE",
      glCode: "1300", expenseCode: "5100", reorderLevel: 0, currency: "USD", isActive: true,
    });
    setItemOpen(true);
  }

  async function onCreate(data: StockItemInput) {
    try {
      await apiFetch("/api/inventory", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Item created", variant: "success" });
      setItemOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  const columns: Column<StockItem>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "category", header: "Category", render: (r) => <Badge variant="outline">{STOCK_CATEGORY_LABEL[r.category as StockCategory]}</Badge> },
    {
      key: "quantityOnHand", header: "On Hand",
      render: (r) => (
        <span className={`tabular-nums ${r.low ? "font-semibold text-amber-400" : ""}`}>
          {num(r.quantityOnHand)} {STOCK_UNIT_LABEL[r.unit as StockUnit]}
          {r.low && <Badge variant="warning" className="ml-2">Low</Badge>}
        </span>
      ),
    },
    { key: "avgCost", header: "Avg Cost", render: (r) => <span className="tabular-nums">{r.currency} {num(r.avgCost)}</span> },
    { key: "value", header: "Value", render: (r) => <span className="font-semibold tabular-nums">{r.currency} {parseFloat(r.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> },
  ];

  return (
    <>
      <DataTable<StockItem>
        endpoint="/api/inventory"
        columns={columns}
        searchPlaceholder="Search by code or name"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Item</Button>}
        rowActions={(r) => (
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setMove({ item: r, type: "RECEIPT" })}>
              <ArrowDownToLine className="h-3.5 w-3.5" />Receive
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMove({ item: r, type: "ISSUE" })}>
              <ArrowUpFromLine className="h-3.5 w-3.5" />Issue
            </Button>
          </div>
        )}
      />

      {/* New item dialog */}
      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Stock Item</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input placeholder="SP-BRAKE-PAD" {...form.register("code")} />
                {form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input {...form.register("name")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v as StockCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((g) => <SelectItem key={g} value={g}>{STOCK_CATEGORY_LABEL[g]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.watch("unit")} onValueChange={(v) => form.setValue("unit", v as StockUnit)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{STOCK_UNIT_LABEL[u]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Inventory GL Code</Label><Input {...form.register("glCode")} /></div>
              <div className="space-y-1.5"><Label>Expense Code (on issue)</Label><Input {...form.register("expenseCode")} /></div>
              <div className="space-y-1.5"><Label>Reorder Level</Label><Input type="number" step="0.001" {...form.register("reorderLevel")} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} {...form.register("currency")} /></div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Movement dialog */}
      {move && (
        <MovementDialog
          item={move.item}
          type={move.type}
          onClose={() => setMove(null)}
          onDone={() => { setMove(null); setRefreshKey((k) => k + 1); }}
        />
      )}
    </>
  );
}

function MovementDialog({
  item, type, onClose, onDone,
}: {
  item: StockItem;
  type: "RECEIPT" | "ISSUE";
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { type, quantity: Number(quantity), reference };
      if (type === "RECEIPT") body.unitCost = Number(unitCost);
      await apiFetch(`/api/inventory/${item.id}/movements`, { method: "POST", body: JSON.stringify(body) });
      toast({ title: type === "RECEIPT" ? "Stock received" : "Stock issued", variant: "success" });
      onDone();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{type === "RECEIPT" ? "Receive Stock" : "Issue Stock"} — {item.code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            On hand: <span className="font-medium text-foreground">{num(item.quantityOnHand)} {STOCK_UNIT_LABEL[item.unit as StockUnit]}</span>
            {" · "}Avg cost: <span className="font-medium text-foreground">{item.currency} {num(item.avgCost)}</span>
          </p>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          {type === "RECEIPT" && (
            <div className="space-y-1.5">
              <Label>Unit Cost ({item.currency})</Label>
              <Input type="number" step="0.0001" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input placeholder={type === "RECEIPT" ? "PO / GRN no." : "Vehicle / trip ref"} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !quantity || (type === "RECEIPT" && !unitCost)}>
            {type === "RECEIPT" ? "Receive" : "Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
