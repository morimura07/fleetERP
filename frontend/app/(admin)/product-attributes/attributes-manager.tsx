"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { ATTRIBUTE_TYPE_LABEL, STOCK_CATEGORY_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { AttributeDataType, StockCategory } from "@frontend/lib/enums";

export interface ProductAttribute {
  id: string; key: string; label: string; dataType: AttributeDataType;
  unit: string | null; options: string | null; category: StockCategory | null; sortOrder: number;
}

const TYPES: AttributeDataType[] = ["TEXT", "NUMBER", "BOOLEAN", "LIST"];
const CATEGORIES = Object.keys(STOCK_CATEGORY_LABEL) as StockCategory[];

export function AttributesManager({ initial }: { initial: ProductAttribute[] }) {
  const { toast } = useToast();
  const [attrs, setAttrs] = useState<ProductAttribute[]>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [dataType, setDataType] = useState<AttributeDataType>("TEXT");
  const [unit, setUnit] = useState("");
  const [options, setOptions] = useState("");
  const [category, setCategory] = useState<string>("all");

  async function reload() {
    setAttrs(await apiFetch<ProductAttribute[]>("/api/product-attributes"));
  }
  function openCreate() {
    setKey(""); setLabel(""); setDataType("TEXT"); setUnit(""); setOptions(""); setCategory("all");
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    try {
      await apiFetch("/api/product-attributes", {
        method: "POST",
        body: JSON.stringify({
          key: key.trim().toLowerCase(), label: label.trim(), dataType,
          unit: unit || null, options: dataType === "LIST" ? options || null : null,
          category: category === "all" ? null : category,
        }),
      });
      toast({ title: "Attribute created", variant: "success" });
      setOpen(false); await reload();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function remove(a: ProductAttribute) {
    if (!confirm(`Delete attribute "${a.label}"? Values on all items are removed.`)) return;
    try {
      await apiFetch(`/api/product-attributes/${a.id}`, { method: "DELETE" });
      toast({ title: "Attribute deleted", variant: "success" });
      await reload();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={openCreate}><Plus className="h-4 w-4" />New Attribute</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Label</th>
              <th className="px-4 py-2.5 font-medium">Key</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Unit</th>
              <th className="px-4 py-2.5 font-medium">Applies To</th>
              <th className="px-4 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {attrs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No attributes yet. Create one to add specs to stock items.</td></tr>
            )}
            {attrs.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{a.label}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.key}</td>
                <td className="px-4 py-3"><Badge variant="outline">{ATTRIBUTE_TYPE_LABEL[a.dataType]}</Badge>{a.dataType === "LIST" && a.options && <span className="ml-2 text-xs text-muted-foreground">{a.options}</span>}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.unit || "—"}</td>
                <td className="px-4 py-3">{a.category ? STOCK_CATEGORY_LABEL[a.category] : <span className="text-muted-foreground">All categories</span>}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Product Attribute</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input placeholder="Viscosity" value={label} onChange={(e) => { setLabel(e.target.value); if (!key) setKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Key <span className="text-muted-foreground">(lower_snake)</span></Label>
                <Input className="font-mono" placeholder="viscosity" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={dataType} onValueChange={(v) => setDataType(v as AttributeDataType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{ATTRIBUTE_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Unit <span className="text-muted-foreground">(optional)</span></Label><Input placeholder="cSt / mm / V" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
              {dataType === "LIST" && (
                <div className="space-y-1.5 md:col-span-2"><Label>Options <span className="text-muted-foreground">(comma-separated)</span></Label><Input placeholder="5W-30, 10W-40, 15W-40" value={options} onChange={(e) => setOptions(e.target.value)} /></div>
              )}
              <div className="space-y-1.5 md:col-span-2">
                <Label>Applies To</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{STOCK_CATEGORY_LABEL[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={busy || !label.trim() || !key.trim()}>Create</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
