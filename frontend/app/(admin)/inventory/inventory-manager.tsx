"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, ArrowDownToLine, ArrowUpFromLine, Tags } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { OptionSelect } from "@frontend/components/ui/option-select";
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import { stockItemSchema, type StockItemInput } from "@frontend/lib/validations";
import { STOCK_CATEGORY_LABEL, STOCK_UNIT_LABEL, VALUATION_METHOD_OPTIONS, PART_CONDITION_OPTIONS } from "@frontend/lib/labels";
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
  const [specsFor, setSpecsFor] = useState<StockItem | null>(null);

  const form = useForm<StockItemInput>({ resolver: zodResolver(stockItemSchema) });

  function openCreate() {
    form.reset({
      dataAreaId: "HQ01", code: "", name: "", category: "SPARE_PART", unit: "PIECE",
      glCode: "1300", expenseCode: "5100", reorderLevel: 0, currency: "USD", isActive: true, hazmat: false,
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
            <Button variant="ghost" size="sm" onClick={() => setSpecsFor(r)}>
              <Tags className="h-3.5 w-3.5" />Specs
            </Button>
          </div>
        )}
      />

      {specsFor && <SpecsDialog item={specsFor} onClose={() => setSpecsFor(null)} />}

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

            <FormSection title="Part Identification & Fleet">
              <div className="space-y-1.5"><Label>OEM Part No.</Label><Input {...form.register("oemPartNumber")} /></div>
              <div className="space-y-1.5"><Label>Supplier Part No.</Label><Input {...form.register("supplierPartNumber")} /></div>
              <div className="space-y-1.5"><Label>Applicable Fleet</Label><Input placeholder="Scania R450…" {...form.register("applicableFleet")} /></div>
              <div className="space-y-1.5"><Label>Part Condition</Label><OptionSelect value={form.watch("partCondition")} onChange={(v) => form.setValue("partCondition", v)} options={PART_CONDITION_OPTIONS} placeholder="Select condition" /></div>
              <div className="space-y-1.5"><Label>Asset Serial No.</Label><Input {...form.register("assetSerialNo")} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...form.register("hazmat")} /> Hazardous material
              </label>
            </FormSection>

            <FormSection title="Purchasing & Financial">
              <div className="space-y-1.5"><Label>Standard Cost</Label><Input inputMode="decimal" {...form.register("standardCost")} /></div>
              <div className="space-y-1.5"><Label>Last Purchase Price</Label><Input inputMode="decimal" {...form.register("lastPurchasePrice")} /></div>
              <div className="space-y-1.5"><Label>Default Vendor</Label><Input {...form.register("defaultVendor")} /></div>
              <div className="space-y-1.5"><Label>Tax Code</Label><Input {...form.register("taxCode")} /></div>
              <div className="space-y-1.5"><Label>Valuation Method</Label><OptionSelect value={form.watch("valuationMethod")} onChange={(v) => form.setValue("valuationMethod", v)} options={VALUATION_METHOD_OPTIONS} placeholder="AVERAGE" /></div>
            </FormSection>

            <FormSection title="Warehousing & Location">
              <div className="space-y-1.5"><Label>Storage Location</Label><Input {...form.register("storageLocation")} /></div>
              <div className="space-y-1.5"><Label>Bin / Rack</Label><Input {...form.register("binRack")} /></div>
              <div className="space-y-1.5"><Label>Batch / Lot</Label><Input {...form.register("batchLot")} /></div>
              <div className="space-y-1.5"><Label>Manufacture Date</Label><Input type="date" {...form.register("manufactureDate")} /></div>
              <div className="space-y-1.5"><Label>Expiry Date</Label><Input type="date" {...form.register("expiryDate")} /></div>
            </FormSection>

            <FormSection title="Inventory Control & Warranty">
              <div className="space-y-1.5"><Label>Max Stock Level</Label><Input type="number" step="0.001" {...form.register("maxStockLevel")} /></div>
              <div className="space-y-1.5"><Label>Safety Stock</Label><Input type="number" step="0.001" {...form.register("safetyStock")} /></div>
              <div className="space-y-1.5"><Label>Lead Time (days)</Label><Input type="number" {...form.register("leadTimeDays")} /></div>
              <div className="space-y-1.5"><Label>Economic Order Qty</Label><Input type="number" step="0.001" {...form.register("economicOrderQty")} /></div>
              <div className="space-y-1.5"><Label>Warranty Period</Label><Input placeholder="12 months / 50,000 km" {...form.register("warrantyPeriod")} /></div>
              <div className="space-y-1.5"><Label>Warranty Start</Label><Input type="date" {...form.register("warrantyStart")} /></div>
              <div className="space-y-1.5"><Label>Quality Status</Label><Input placeholder="Available / Quarantined" {...form.register("qualityStatus")} /></div>
            </FormSection>

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

// ── Product attributes / specs editor (M16) ──

interface ItemAttribute {
  attributeId: string;
  key: string;
  label: string;
  dataType: "TEXT" | "NUMBER" | "BOOLEAN" | "LIST";
  unit: string | null;
  options: string[] | null;
  value: string | null;
}

function SpecsDialog({ item, onClose }: { item: { id: string; name: string }; onClose: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ItemAttribute[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<ItemAttribute[]>(`/api/inventory/${item.id}/attributes`)
      .then((r) => { setRows(r); setDraft(Object.fromEntries(r.map((a) => [a.attributeId, a.value ?? ""]))); })
      .catch((e) => { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to load", variant: "destructive" }); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function save() {
    setBusy(true);
    try {
      await apiFetch(`/api/inventory/${item.id}/attributes`, {
        method: "PUT",
        body: JSON.stringify({ values: Object.entries(draft).map(([attributeId, value]) => ({ attributeId, value: value || null })) }),
      });
      toast({ title: "Specs saved", variant: "success" });
      onClose();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Specs — {item.name}</DialogTitle></DialogHeader>
        {!rows ? <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No attributes apply to this item&apos;s category. Define attributes under Product Attributes first.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((a) => (
                <div key={a.attributeId} className="grid grid-cols-[10rem_1fr] items-center gap-3">
                  <Label className="text-sm">{a.label}{a.unit ? <span className="ml-1 text-xs text-muted-foreground">({a.unit})</span> : null}</Label>
                  {a.dataType === "BOOLEAN" ? (
                    <Select value={draft[a.attributeId] || "none"} onValueChange={(v) => setDraft((d) => ({ ...d, [a.attributeId]: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">—</SelectItem><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                    </Select>
                  ) : a.dataType === "LIST" && a.options ? (
                    <Select value={draft[a.attributeId] || "none"} onValueChange={(v) => setDraft((d) => ({ ...d, [a.attributeId]: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">—</SelectItem>{a.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input type={a.dataType === "NUMBER" ? "number" : "text"} value={draft[a.attributeId] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [a.attributeId]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          )}
        {rows && rows.length > 0 && (
          <DialogFooter><Button onClick={save} disabled={busy}>Save Specs</Button></DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
