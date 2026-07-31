"use client";
import { useCallback, useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Loader } from "@frontend/components/ui/loader";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { budgetSchema, type BudgetInput } from "@frontend/lib/validations";
import { BUDGET_KIND_LABEL, BUDGET_CONTROL_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { BudgetControl, BudgetKind } from "@frontend/lib/enums";

interface LineStatus {
  id: string; kind: string; costCenter: string; accountCode: string;
  amount: string; consumed: string; remaining: string; utilizationPct: number;
}
interface Budget {
  id: string; name: string; fiscalYear: number; control: BudgetControl; isActive: boolean;
  lines: LineStatus[];
}

const CONTROLS = Object.keys(BUDGET_CONTROL_LABEL) as BudgetControl[];
const KINDS = Object.keys(BUDGET_KIND_LABEL) as BudgetKind[];

function UtilBar({ pct }: { pct: number }) {
  const color = pct > 100 ? "bg-destructive" : pct >= 90 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export function BudgetsManager() {
  const { toast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const form = useForm<BudgetInput>({ resolver: zodResolver(budgetSchema) });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Budget[]>("/api/budgets?pageSize=50");
      setBudgets(data);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() {
    form.reset({
      dataAreaId: "HQ01", name: "", fiscalYear: new Date().getFullYear(),
      control: "WARNING_ONLY", isActive: true,
      lines: [{ kind: "OPEX", costCenter: "", accountCode: "", amount: "" }],
    });
    setOpen(true);
  }

  async function onSubmit(data: BudgetInput) {
    try {
      await apiFetch("/api/budgets", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Budget saved", variant: "success" });
      setOpen(false);
      load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus className="h-4 w-4" />New Budget</Button>
      </div>

      {loading ? (
        <Loader size={36} label="Loading budgets…" />
      ) : budgets.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No budgets yet.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {budgets.map((b) => (
            <Card key={b.id}>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>{b.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">FY{b.fiscalYear}</p>
                </div>
                <Badge variant="outline">{BUDGET_CONTROL_LABEL[b.control]}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {b.lines.length === 0 && <p className="text-sm text-muted-foreground">No lines.</p>}
                {b.lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-12 items-center gap-3 text-sm">
                    <div className="col-span-3">
                      <p className="font-medium">{l.costCenter}</p>
                      <div className="text-xs text-muted-foreground"><Badge variant="secondary" className="mr-1">{BUDGET_KIND_LABEL[l.kind as BudgetKind]}</Badge><span className="font-mono">{l.accountCode}</span></div>
                    </div>
                    <div className="col-span-5"><UtilBar pct={l.utilizationPct} /></div>
                    <div className="col-span-4 text-right tabular-nums">
                      <span className={l.utilizationPct > 100 ? "text-destructive font-semibold" : ""}>{l.consumed}</span>
                      <span className="text-muted-foreground"> / {l.amount}</span>
                      <span className="ml-2 text-xs text-muted-foreground">({l.utilizationPct}%)</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New Budget</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Name</Label>
                <Input placeholder="FY2026 Operating Budget" {...form.register("name")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Fiscal Year</Label>
                <Input type="number" {...form.register("fiscalYear")} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Control Behavior</Label>
                <Select value={form.watch("control")} onValueChange={(v) => form.setValue("control", v as BudgetControl)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTROLS.map((c) => <SelectItem key={c} value={c}>{BUDGET_CONTROL_LABEL[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Budget Lines</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ kind: "OPEX", costCenter: "", accountCode: "", amount: "" })}><Plus className="h-4 w-4" />Add Line</Button>
              </div>
              {fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Kind</Label>
                    <Select value={form.watch(`lines.${i}.kind`)} onValueChange={(v) => form.setValue(`lines.${i}.kind`, v as BudgetKind)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{BUDGET_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4 space-y-1">
                    <Label className="text-xs">Cost Center</Label>
                    <Input placeholder="Fleet Operations" {...form.register(`lines.${i}.costCenter`)} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Account</Label>
                    <Input placeholder="5000" {...form.register(`lines.${i}.accountCode`)} />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Amount</Label>
                    <Input placeholder="100000.00" {...form.register(`lines.${i}.amount`)} />
                  </div>
                  <div className="col-span-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
