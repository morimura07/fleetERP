"use client";
import { Fragment, useMemo, useState } from "react";
import { Plus, Trash2, ArrowRightLeft } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { UOM_DIMENSION_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { UomDimension } from "@frontend/lib/enums";

export interface Unit {
  id: string; code: string; name: string; dimension: UomDimension;
  symbol: string | null; factorToBase: string; isBase: boolean; isActive: boolean;
}

const DIMENSIONS = Object.keys(UOM_DIMENSION_LABEL) as UomDimension[];

export function UnitsManager({ initial }: { initial: Unit[] }) {
  const { toast } = useToast();
  const [units, setUnits] = useState<Unit[]>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [dimension, setDimension] = useState<UomDimension>("WEIGHT");
  const [symbol, setSymbol] = useState("");
  const [isBase, setIsBase] = useState(false);
  const [factorToBase, setFactorToBase] = useState("1");

  // Converter widget state.
  const [convQty, setConvQty] = useState("1");
  const [convFrom, setConvFrom] = useState<string>(initial[0]?.code ?? "");
  const [convTo, setConvTo] = useState<string>(initial[1]?.code ?? initial[0]?.code ?? "");
  const [convResult, setConvResult] = useState<string | null>(null);
  const [convErr, setConvErr] = useState<string | null>(null);

  // Group units by dimension for the table.
  const grouped = useMemo(() => {
    const m = new Map<UomDimension, Unit[]>();
    for (const u of units) {
      const arr = m.get(u.dimension) ?? [];
      arr.push(u);
      m.set(u.dimension, arr);
    }
    return DIMENSIONS.filter((d) => m.has(d)).map((d) => [d, m.get(d)!] as const);
  }, [units]);

  async function reload() {
    setUnits(await apiFetch<Unit[]>("/api/units"));
  }
  function openCreate() {
    setCode(""); setName(""); setDimension("WEIGHT"); setSymbol(""); setIsBase(false); setFactorToBase("1");
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    try {
      await apiFetch("/api/units", {
        method: "POST",
        body: JSON.stringify({
          code: code.trim().toUpperCase(), name: name.trim(), dimension,
          symbol: symbol || null, isBase, factorToBase: isBase ? 1 : Number(factorToBase),
        }),
      });
      toast({ title: "Unit created", variant: "success" });
      setOpen(false); await reload();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function remove(u: Unit) {
    if (!confirm(`Delete unit "${u.code} — ${u.name}"?`)) return;
    try {
      await apiFetch(`/api/units/${u.id}`, { method: "DELETE" });
      toast({ title: "Unit deleted", variant: "success" });
      await reload();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  async function runConvert() {
    setConvResult(null); setConvErr(null);
    try {
      const r = await apiFetch<{ result: number; from: string; to: string }>("/api/units/convert", {
        method: "POST",
        body: JSON.stringify({ qty: Number(convQty), from: convFrom, to: convTo }),
      });
      // Trim to a sensible precision without trailing zeros.
      const val = Number(r.result.toFixed(8));
      setConvResult(`${convQty} ${r.from} = ${val} ${r.to}`);
    } catch (e) {
      setConvErr(e instanceof ApiError ? e.message : "Conversion failed");
    }
  }

  return (
    <>
      {/* Converter widget */}
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <ArrowRightLeft className="h-4 w-4 text-primary" />Quantity Converter
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" className="w-28" value={convQty} onChange={(e) => setConvQty(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Select value={convFrom} onValueChange={setConvFrom}>
              <SelectTrigger className="w-40"><SelectValue placeholder="unit" /></SelectTrigger>
              <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.code}>{u.code} — {u.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Select value={convTo} onValueChange={setConvTo}>
              <SelectTrigger className="w-40"><SelectValue placeholder="unit" /></SelectTrigger>
              <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.code}>{u.code} — {u.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={runConvert} disabled={!convFrom || !convTo}>Convert</Button>
          {convResult && <div className="ml-1 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">{convResult}</div>}
          {convErr && <div className="ml-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{convErr}</div>}
        </div>
      </div>

      <div className="mt-4 mb-3 flex justify-end">
        <Button onClick={openCreate}><Plus className="h-4 w-4" />New Unit</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Symbol</th>
              <th className="px-4 py-2.5 text-right font-medium">Factor to base</th>
              <th className="px-4 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {units.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No units yet. Create one — start with a base unit per dimension (e.g. KG for weight), then add convertible units.</td></tr>
            )}
            {grouped.map(([dim, list]) => (
              <Fragment key={dim}>
                <tr className="border-b border-border bg-muted/20">
                  <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{UOM_DIMENSION_LABEL[dim]}</td>
                </tr>
                {list.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">
                      {u.code}
                      {u.isBase && <Badge variant="outline" className="ml-2 border-primary/40 text-primary">base</Badge>}
                    </td>
                    <td className="px-4 py-3 text-foreground">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.symbol || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">{Number(u.factorToBase)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => remove(u)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Unit of Measure</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input className="font-mono uppercase" placeholder="TON" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="Metric Tonne" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Dimension</Label>
                <Select value={dimension} onValueChange={(v) => setDimension(v as UomDimension)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIMENSIONS.map((d) => <SelectItem key={d} value={d}>{UOM_DIMENSION_LABEL[d]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Symbol <span className="text-muted-foreground">(optional)</span></Label><Input placeholder="t" value={symbol} onChange={(e) => setSymbol(e.target.value)} /></div>
              <label className="flex items-center gap-2 md:col-span-2">
                <input type="checkbox" checked={isBase} onChange={(e) => setIsBase(e.target.checked)} className="h-4 w-4 rounded border-border" />
                <span className="text-sm">This is the <strong>base unit</strong> for its dimension (factor fixed at 1)</span>
              </label>
              {!isBase && (
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Factor to base <span className="text-muted-foreground">(how many base units = 1 of this)</span></Label>
                  <Input type="number" step="any" placeholder="1000" value={factorToBase} onChange={(e) => setFactorToBase(e.target.value)} />
                  <p className="text-xs text-muted-foreground">e.g. if the base weight unit is KG, a Metric Tonne has a factor of 1000.</p>
                </div>
              )}
            </div>
            <DialogFooter><Button onClick={submit} disabled={busy || !code.trim() || !name.trim() || (!isBase && !(Number(factorToBase) > 0))}>Create</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
