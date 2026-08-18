"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { damageReportSchema, type DamageReportInput } from "@frontend/lib/validations";
import { DAMAGE_STATUS_LABEL, DAMAGE_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { DamageStatus } from "@frontend/lib/enums";

type Trip = { id: string; tripCode: string };
type Order = { id: string; orderCode: string };

interface DamageRow {
  id: string; reportNumber: string; status: DamageStatus; reportedAt: string;
  cargoValue: string; damageValue: string; currency: string; description: string | null;
  order: { orderCode: string } | null;
}

const STATUSES: DamageStatus[] = ["REPORTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "SETTLED"];
const money = (v: string, c: string) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const today = () => new Date().toISOString().slice(0, 10);

export function DamageReportsManager({ orders, trips }: { orders: Order[]; trips: Trip[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<DamageReportInput>({ resolver: zodResolver(damageReportSchema) });

  function openCreate() {
    form.reset({ orderId: "", tripId: "", reportedAt: today() as unknown as Date, cargoValue: 0, damageValue: 0, currency: "USD", description: "" });
    setOpen(true);
  }

  async function onSubmit(data: DamageReportInput) {
    try {
      await apiFetch("/api/operational-kpi/damage-reports", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Damage report filed", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function advance(id: string, status: DamageStatus) {
    try {
      await apiFetch(`/api/operational-kpi/damage-reports/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast({ title: `Marked ${DAMAGE_STATUS_LABEL[status]}`, variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<DamageRow>[] = [
    { key: "reportNumber", header: "Report", render: (r) => <span className="font-mono">{r.reportNumber}</span> },
    { key: "reportedAt", header: "Date", render: (r) => <span className="text-xs">{day(r.reportedAt)}</span> },
    { key: "order", header: "Order", render: (r) => r.order?.orderCode ?? "—" },
    { key: "cargoValue", header: "Cargo Value", render: (r) => <span className="tabular-nums">{money(r.cargoValue, r.currency)}</span> },
    { key: "damageValue", header: "Damage Value", render: (r) => <span className="tabular-nums text-destructive">{money(r.damageValue, r.currency)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={DAMAGE_STATUS_VARIANT[r.status]}>{DAMAGE_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<DamageRow>
        endpoint="/api/operational-kpi/damage-reports"
        columns={columns}
        searchPlaceholder="Search report no. or description"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />File Report</Button>}
        rowActions={(r) => (
          <Select value={r.status} onValueChange={(v) => advance(r.id, v as DamageStatus)}>
            <SelectTrigger className="h-8 w-[9rem]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{DAMAGE_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>File Damage Report</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Report Date</Label>
                <Input type="date" {...form.register("reportedAt")} />
                {form.formState.errors.reportedAt && <p className="text-xs text-destructive">{form.formState.errors.reportedAt.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <CurrencySelect value={form.watch("currency")} onChange={(v) => form.setValue("currency", v)} />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo Value</Label>
                <Input type="number" step="0.01" {...form.register("cargoValue")} />
                {form.formState.errors.cargoValue && <p className="text-xs text-destructive">{form.formState.errors.cargoValue.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Damage Value</Label>
                <Input type="number" step="0.01" {...form.register("damageValue")} />
                {form.formState.errors.damageValue && <p className="text-xs text-destructive">{form.formState.errors.damageValue.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Order (optional)</Label>
                <Select value={form.watch("orderId") || "none"} onValueChange={(v) => form.setValue("orderId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Link an order" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderCode}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Trip (optional)</Label>
                <Select value={form.watch("tripId") || "none"} onValueChange={(v) => form.setValue("tripId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Link a trip" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {trips.map((t) => <SelectItem key={t.id} value={t.id}>{t.tripCode}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Description</Label>
                <Input placeholder="Water damage to 40 cartons on offload" {...form.register("description")} />
              </div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>File Report</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
