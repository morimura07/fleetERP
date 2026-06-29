"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { exchangeRateSchema, type ExchangeRateInput } from "@/lib/validations";
import { RATE_TYPE_LABEL } from "@/lib/labels";
import { apiFetch, ApiError } from "@/lib/fetcher";
import type { RateType } from "@prisma/client";

interface Rate extends ExchangeRateInput { id: string; }

const RATE_TYPES = Object.keys(RATE_TYPE_LABEL) as RateType[];

const fmtDate = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

const columns: Column<Rate>[] = [
  { key: "currency", header: "Currency", render: (r) => <span className="font-mono">{r.currency} → {r.baseCurrency}</span> },
  { key: "rateType", header: "Type", render: (r) => <Badge variant="outline">{RATE_TYPE_LABEL[r.rateType as RateType]}</Badge> },
  { key: "rate", header: "Rate", render: (r) => <span className="tabular-nums">{r.rate}</span> },
  { key: "validFrom", header: "Valid From", render: (r) => <span className="tabular-nums">{fmtDate(r.validFrom)}</span> },
  { key: "dataAreaId", header: "Entity" },
];

export function FxManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<ExchangeRateInput>({ resolver: zodResolver(exchangeRateSchema) });

  function openCreate() {
    form.reset({ dataAreaId: "HQ01", currency: "", baseCurrency: "USD", rateType: "SPOT", rate: "", validFrom: new Date() });
    setOpen(true);
  }

  async function onSubmit(data: ExchangeRateInput) {
    try {
      await apiFetch("/api/fx", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Rate saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Rate>
        endpoint="/api/fx"
        columns={columns}
        searchPlaceholder="Search by currency"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Rate</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Exchange Rate</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input maxLength={3} placeholder="TZS" {...form.register("currency")} />
                {form.formState.errors.currency && <p className="text-xs text-destructive">{form.formState.errors.currency.message}</p>}
              </div>
              <div className="space-y-1.5"><Label>Base Currency</Label><Input maxLength={3} {...form.register("baseCurrency")} /></div>
              <div className="space-y-1.5">
                <Label>Rate Type</Label>
                <Select value={form.watch("rateType")} onValueChange={(v) => form.setValue("rateType", v as RateType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RATE_TYPES.map((t) => <SelectItem key={t} value={t}>{RATE_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rate (foreign × rate = base)</Label>
                <Input placeholder="0.000385" {...form.register("rate")} />
                {form.formState.errors.rate && <p className="text-xs text-destructive">{form.formState.errors.rate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Valid From</Label>
                <Input type="date" {...form.register("validFrom")} />
              </div>
              <div className="space-y-1.5"><Label>Entity</Label><Input maxLength={10} {...form.register("dataAreaId")} /></div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
