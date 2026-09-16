"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Textarea } from "@frontend/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { type ItemOpt, type LineRow, type RequisitionDetail, money } from "./shared";

const blank = (): LineRow => ({ stockItemId: null, description: "", uom: "PIECE", quantity: "1", estUnitPrice: "0", expenseCode: "5100", specification: null });

/**
 * Create or edit a requisition: header, then one row per item. Picking an
 * item from the master fills the description, unit and expense code; a
 * free-text line is allowed for things the master does not have yet.
 */
export function RequisitionForm({ items, initial, onClose, onSaved }: { items: ItemOpt[]; initial?: RequisitionDetail; onClose: () => void; onSaved: (r: RequisitionDetail) => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [costCenter, setCostCenter] = useState(initial?.costCenter ?? "");
  const [neededBy, setNeededBy] = useState(initial?.neededBy?.slice(0, 10) ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [justification, setJustification] = useState(initial?.justification ?? "");
  const [lines, setLines] = useState<LineRow[]>(initial?.lines.map((l) => ({ ...l, quantity: String(Number(l.quantity)), estUnitPrice: String(Number(l.estUnitPrice)) })) ?? [blank()]);
  const [busy, setBusy] = useState(false);

  const setLine = (i: number, patch: Partial<LineRow>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickItem = (i: number, id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) return setLine(i, { stockItemId: null });
    setLine(i, { stockItemId: it.id, description: it.name, uom: it.unit, expenseCode: it.expenseCode });
  };
  const total = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.estUnitPrice || 0), 0);

  async function submit() {
    setBusy(true);
    try {
      const body = {
        title, department: department || null, costCenter: costCenter || null, neededBy: neededBy || null, currency, justification: justification || null,
        lines: lines.map((l) => ({ stockItemId: l.stockItemId, description: l.description, uom: l.uom, quantity: Number(l.quantity), estUnitPrice: Number(l.estUnitPrice), expenseCode: l.expenseCode, specification: l.specification || null })),
      };
      const saved = initial
        ? await apiFetch<RequisitionDetail>(`/api/requisitions/${initial.id}`, { method: "PUT", body: JSON.stringify({ version: initial.version, ...body }) })
        : await apiFetch<RequisitionDetail>("/api/requisitions", { method: "POST", body: JSON.stringify(body) });
      toast({ title: initial ? "Requisition updated" : `${saved.prNumber} created`, variant: "success" });
      onSaved(saved); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>{initial ? `Edit ${initial.prNumber}` : "New purchase requisition"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is being bought and why" /></div>
            <div className="space-y-1.5"><Label>Currency</Label><CurrencySelect value={currency} onChange={setCurrency} /></div>
            <div className="space-y-1.5"><Label>Department</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Fleet, Workshop, Admin" /></div>
            <div className="space-y-1.5"><Label>Cost centre</Label><Input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} placeholder="Matches the budget's cost centre" /></div>
            <div className="space-y-1.5"><Label>Needed by</Label><Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} /></div>
            <div className="space-y-1.5 md:col-span-3"><Label>Justification</Label><Textarea rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} /></div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-muted-foreground">
                <tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">Description</th><th className="p-2 text-left">UOM</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Est. price</th><th className="p-2 text-left">Account</th><th className="p-2 text-right">Total</th><th /></tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="p-1 min-w-[180px]">
                      <Select value={l.stockItemId ?? "free"} onValueChange={(v) => pickItem(i, v === "free" ? "" : v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free text</SelectItem>
                          {items.map((it) => <SelectItem key={it.id} value={it.id}>{it.code} · {it.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1 min-w-[220px]">
                      <Input className="h-9" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                      <Input className="mt-1 h-8 text-xs" placeholder="Technical specification (optional)" value={l.specification ?? ""} onChange={(e) => setLine(i, { specification: e.target.value })} />
                    </td>
                    <td className="p-1 w-24"><Input className="h-9" value={l.uom} onChange={(e) => setLine(i, { uom: e.target.value.toUpperCase() })} /></td>
                    <td className="p-1 w-24"><Input className="h-9 text-right" type="number" min="0" step="0.001" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                    <td className="p-1 w-32"><Input className="h-9 text-right" type="number" min="0" step="0.01" value={l.estUnitPrice} onChange={(e) => setLine(i, { estUnitPrice: e.target.value })} /></td>
                    <td className="p-1 w-24"><Input className="h-9" value={l.expenseCode} onChange={(e) => setLine(i, { expenseCode: e.target.value })} /></td>
                    <td className="p-1 text-right tabular-nums pt-3">{money(Number(l.quantity || 0) * Number(l.estUnitPrice || 0), currency)}</td>
                    <td className="p-1 pt-1"><Button variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t p-2">
              <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}><Plus className="h-3.5 w-3.5" />Add line</Button>
              <span className="text-sm font-semibold tabular-nums">Estimated total {money(total, currency)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Estimates decide the approval tier; the tier is worked out in {"the policy's"} threshold currency at the day&#39;s rate. Attach specification documents from the requisition once it is saved.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title || lines.some((l) => !l.description)}>{initial ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
