"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Contact } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { PartyProfilePanel } from "@frontend/components/data/party-profile-panel";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
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

const TRANSPORT_MODES = [
  ["FTL", "Full truckload"], ["LTL", "Less than truckload"], ["RAIL", "Rail"],
  ["OCEAN", "Ocean"], ["AIR", "Air"], ["INTERMODAL", "Intermodal"],
] as const;

const INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"] as const;
/** Radix Select has no empty value, so "not specified" needs a sentinel. */
const NO_INCOTERM = "__none__";

interface Client extends ClientInput { id: string; version: number; }

const columns: Column<Client>[] = [
  { key: "companyName", header: "Company" },
  { key: "contactPerson", header: "Contact" },
  { key: "phone", header: "Phone" },
  { key: "email", header: "Email" },
];

export function ClientsManager() {
  const { toast } = useToast();
  const [profileFor, setProfileFor] = useState<Client | null>(null);
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
            <Button variant="ghost" size="icon" title="Locations and contacts" onClick={() => setProfileFor(row)}>
              <Contact className="h-4 w-4" />
            </Button>
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
              <div className="space-y-1.5"><Label>Currency</Label><CurrencySelect value={form.watch("currency")} onChange={(v) => form.setValue("currency", v)} /></div>
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

            <FormSection title="Banking & Tax">
              <div className="space-y-1.5"><Label>Tax Jurisdiction</Label><Input placeholder="TZ-DSM" {...form.register("taxJurisdiction")} /></div>
              <div className="space-y-1.5"><Label>Bank Name</Label><Input {...form.register("bankName")} /></div>
              <div className="space-y-1.5"><Label>Account Number</Label><Input {...form.register("bankAccountNumber")} /></div>
              <div className="space-y-1.5"><Label>SWIFT</Label><Input {...form.register("bankSwift")} /></div>
              <div className="space-y-1.5"><Label>IBAN</Label><Input {...form.register("bankIban")} /></div>
            </FormSection>

            <FormSection title="Logistics & Contract">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Preferred Modes</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                  {TRANSPORT_MODES.map(([v, l]) => (
                    <label key={v} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <input type="checkbox" value={v} {...form.register("preferredModes")} /> {l}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Incoterm</Label>
                <Select value={form.watch("incoterm") ?? NO_INCOTERM}
                  onValueChange={(v) => form.setValue("incoterm", v === NO_INCOTERM ? null : (v as ClientInput["incoterm"]))}>
                  <SelectTrigger><SelectValue placeholder="Not specified" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_INCOTERM}>Not specified</SelectItem>
                    {INCOTERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Service Areas</Label><Input placeholder="Dar, Mwanza, Mbeya" {...form.register("serviceAreas")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Delivery Windows</Label><Input placeholder="08:00-17:00 weekdays; no weekend offload" {...form.register("deliveryWindows")} /></div>
            </FormSection>

            <FormSection title="Customs & Portal">
              <div className="space-y-1.5"><Label>Safety Rating</Label><Input {...form.register("safetyRating")} /></div>
              <div className="space-y-1.5"><Label>Customs Broker Code</Label><Input {...form.register("customsBrokerCode")} /></div>
              <div className="space-y-1.5"><Label>Customs Bond Number</Label><Input {...form.register("customsBondNumber")} /></div>
              <div className="space-y-1.5"><Label>Portal URL</Label><Input placeholder="https://…" {...form.register("portalUrl")} /></div>
              <div className="space-y-1.5"><Label>Portal Username</Label><Input {...form.register("portalUsername")} /></div>
              <p className="col-span-2 text-xs text-muted-foreground">
                The password is deliberately not stored: keeping another company&apos;s credentials
                recoverable is not worth the convenience.
              </p>
            </FormSection>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={profileFor !== null} onOpenChange={(o) => !o && setProfileFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{profileFor?.companyName}</DialogTitle></DialogHeader>
          {profileFor && <PartyProfilePanel partyType="clients" partyId={profileFor.id} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
