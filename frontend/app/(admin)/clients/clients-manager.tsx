"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import { clientSchema, type ClientInput } from "@frontend/lib/validations";
import { PARTY_STATUS_LABEL, PAYMENT_TERM_LABEL } from "@frontend/lib/labels";
import type { PartyStatus, PaymentTerm } from "@frontend/lib/enums";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

const CLIENT_STATUSES = Object.keys(PARTY_STATUS_LABEL) as PartyStatus[];
const CLIENT_TERMS = Object.keys(PAYMENT_TERM_LABEL) as PaymentTerm[];

interface Client extends ClientInput { id: string; version: number; }

const columns: Column<Client>[] = [
  { key: "companyName", header: "Company" },
  { key: "contactPerson", header: "Contact" },
  { key: "phone", header: "Phone" },
  { key: "email", header: "Email" },
];

export function ClientsManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const form = useForm<ClientInput>({ resolver: zodResolver(clientSchema) });

  function openCreate() { setEditing(null); form.reset({ companyName: "", contactPerson: "", phone: "", address: "", email: "", status: "ACTIVE", currency: "USD", paymentTerm: "NET_30", creditLimit: 0, taxExempt: false, hazmatCertified: false }); setOpen(true); }
  function openEdit(c: Client) { setEditing(c); form.reset(c); setOpen(true); }

  async function onSubmit(data: ClientInput) {
    try {
      if (editing) {
        await apiFetch(`/api/clients/${editing.id}`, { method: "PATCH", body: JSON.stringify({ ...data, version: editing.version }) });
      } else {
        await apiFetch("/api/clients", { method: "POST", body: JSON.stringify(data) });
      }
      toast({ title: "Saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function onDelete(c: Client) {
    if (!confirm(`Delete ${c.companyName}?`)) return;
    try {
      await apiFetch(`/api/clients/${c.id}`, { method: "DELETE" });
      toast({ title: "Deleted", variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to delete", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Client>
        endpoint="/api/clients"
        columns={columns}
        searchPlaceholder="Search by company, contact, or email"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New</Button>}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Client" : "New Client"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {([
              ["companyName", "Company"], ["contactPerson", "Contact Person"],
              ["phone", "Phone"], ["email", "Email"], ["address", "Address"],
            ] as const).map(([name, label]) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={name}>{label}</Label>
                <Input id={name} {...form.register(name)} />
                {form.formState.errors[name] && (
                  <p className="text-xs text-destructive">{form.formState.errors[name]?.message as string}</p>
                )}
              </div>
            ))}

            <FormSection title="General & Contact" defaultOpen>
              <div className="space-y-1.5"><Label>Trade Name (DBA)</Label><Input {...form.register("tradeName")} /></div>
              <div className="space-y-1.5"><Label>Industry</Label><Input placeholder="3PL / Retail…" {...form.register("industry")} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as PartyStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CLIENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{PARTY_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Website</Label><Input {...form.register("website")} /></div>
              <div className="space-y-1.5"><Label>Account Manager</Label><Input {...form.register("accountManager")} /></div>
            </FormSection>

            <FormSection title="Billing & Financial">
              <div className="space-y-1.5"><Label>TIN</Label><Input {...form.register("tin")} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} {...form.register("currency")} /></div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Select value={form.watch("paymentTerm")} onValueChange={(v) => form.setValue("paymentTerm", v as PaymentTerm)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CLIENT_TERMS.map((t) => <SelectItem key={t} value={t}>{PAYMENT_TERM_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Credit Limit</Label><Input inputMode="decimal" {...form.register("creditLimit")} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...form.register("taxExempt")} /> Tax exempt
              </label>
            </FormSection>

            <FormSection title="Freight & Compliance">
              <div className="space-y-1.5"><Label>Shipping Preferences</Label><Input placeholder="LTL / FTL / Ocean…" {...form.register("shippingPreferences")} /></div>
              <div className="space-y-1.5"><Label>Preferred Carriers</Label><Input {...form.register("preferredCarriers")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Insurance Requirement</Label><Input {...form.register("insuranceRequirement")} /></div>
              <div className="space-y-1.5"><Label>SLA Expiry</Label><Input type="date" {...form.register("slaExpiry")} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...form.register("hazmatCertified")} /> HAZMAT certified
              </label>
            </FormSection>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
