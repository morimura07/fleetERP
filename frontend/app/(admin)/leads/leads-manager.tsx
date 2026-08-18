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
import { leadSchema, type LeadInput } from "@frontend/lib/validations";
import { LEAD_STAGE_LABEL, LEAD_STAGE_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { LeadStage } from "@frontend/lib/enums";

type Salesperson = { id: string; name: string };

interface LeadRow {
  id: string; companyName: string; contactPerson: string | null; stage: LeadStage;
  estimatedValue: string; currency: string; source: string | null;
  owner: { name: string } | null; _count: { quotes: number };
}

const STAGES: LeadStage[] = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];
const money = (v: string, c: string) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

export function LeadsManager({ salespeople }: { salespeople: Salesperson[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<LeadInput>({ resolver: zodResolver(leadSchema) });

  function openCreate() {
    form.reset({ companyName: "", contactPerson: "", email: "", phone: "", source: "", stage: "NEW", estimatedValue: 0, currency: "USD", ownerId: "", notes: "" });
    setOpen(true);
  }

  async function onSubmit(data: LeadInput) {
    try {
      await apiFetch("/api/sales/leads", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Lead saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function advance(id: string, stage: LeadStage) {
    try {
      await apiFetch(`/api/sales/leads/${id}/stage`, { method: "POST", body: JSON.stringify({ stage }) });
      toast({ title: `Moved to ${LEAD_STAGE_LABEL[stage]}`, variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<LeadRow>[] = [
    { key: "companyName", header: "Company", render: (r) => <span className="font-medium">{r.companyName}</span> },
    { key: "contactPerson", header: "Contact", render: (r) => r.contactPerson || "—" },
    { key: "source", header: "Source", render: (r) => r.source || "—" },
    { key: "estimatedValue", header: "Est. Value", render: (r) => <span className="tabular-nums">{money(r.estimatedValue, r.currency)}</span> },
    { key: "owner", header: "Owner", render: (r) => r.owner?.name ?? "—" },
    { key: "quotes", header: "Quotes", render: (r) => <span className="tabular-nums">{r._count.quotes}</span> },
    { key: "stage", header: "Stage", render: (r) => <Badge variant={LEAD_STAGE_VARIANT[r.stage]}>{LEAD_STAGE_LABEL[r.stage]}</Badge> },
  ];

  return (
    <>
      <DataTable<LeadRow>
        endpoint="/api/sales/leads"
        columns={columns}
        searchPlaceholder="Search company or contact"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Lead</Button>}
        rowActions={(r) => (
          <Select value={r.stage} onValueChange={(v) => advance(r.id, v as LeadStage)}>
            <SelectTrigger className="h-8 w-[8.5rem]"><SelectValue /></SelectTrigger>
            <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{LEAD_STAGE_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Company</Label>
                <Input placeholder="Acme Freight Ltd" {...form.register("companyName")} />
                {form.formState.errors.companyName && <p className="text-xs text-destructive">{form.formState.errors.companyName.message}</p>}
              </div>
              <div className="space-y-1.5"><Label>Contact Person</Label><Input {...form.register("contactPerson")} /></div>
              <div className="space-y-1.5"><Label>Source</Label><Input placeholder="Referral / Web / Campaign" {...form.register("source")} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" {...form.register("email")} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input {...form.register("phone")} /></div>
              <div className="space-y-1.5">
                <Label>Estimated Value</Label>
                <Input type="number" step="0.01" {...form.register("estimatedValue")} />
              </div>
              <div className="space-y-1.5"><Label>Currency</Label><CurrencySelect value={form.watch("currency")} onChange={(v) => form.setValue("currency", v)} /></div>
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select value={form.watch("ownerId") || "none"} onValueChange={(v) => form.setValue("ownerId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Assign salesperson" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {salespeople.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Select value={form.watch("stage")} onValueChange={(v) => form.setValue("stage", v as LeadStage)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{LEAD_STAGE_LABEL[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Input {...form.register("notes")} /></div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
