"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import { customerSchema, type CustomerInput } from "@frontend/lib/validations";
import { CUSTOMER_ACCOUNT_GROUP_LABEL, PAYMENT_TERM_LABEL, PARTY_STATUS_LABEL, INCOTERMS_OPTIONS } from "@frontend/lib/labels";
import { OptionSelect } from "@frontend/components/ui/option-select";
import type { CustomerAccountGroup, PaymentTerm, PartyStatus } from "@frontend/lib/enums";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

const ACCT_GROUPS = Object.keys(CUSTOMER_ACCOUNT_GROUP_LABEL) as CustomerAccountGroup[];
const CUST_TERMS = Object.keys(PAYMENT_TERM_LABEL) as PaymentTerm[];
const CUST_STATUSES = Object.keys(PARTY_STATUS_LABEL) as PartyStatus[];

interface Customer extends CustomerInput { id: string; }

const columns: Column<Customer>[] = [
  { key: "code", header: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
  { key: "name", header: "Name" },
  { key: "creditLimit", header: "Credit Limit", render: (r) => `${r.currency} ${parseFloat(String(r.creditLimit)).toLocaleString()}` },
  { key: "creditDays", header: "Credit Days", render: (r) => `${r.creditDays}d` },
  { key: "taxExempt", header: "Tax", render: (r) => r.taxExempt ? <Badge variant="info">Exempt</Badge> : <span className="text-muted-foreground">Standard</span> },
  { key: "isActive", header: "Status", render: (r) => r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
];

export function CustomersManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<CustomerInput>({ resolver: zodResolver(customerSchema) });

  function openCreate() {
    form.reset({ dataAreaId: "HQ01", code: "", name: "", creditLimit: "0", creditDays: 30, taxExempt: false, currency: "USD", isActive: true, accountGroup: "SOLD_TO", paymentTerm: "NET_30", hazmatCertified: false, country: "TZ", accountStatus: "ACTIVE", creditHoldOverride: false, discountPercent: 0, discountDays: 0, penaltyRate: 0, podRequired: false });
    setOpen(true);
  }

  async function onSubmit(data: CustomerInput) {
    try {
      await apiFetch("/api/customers", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Customer saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Customer>
        endpoint="/api/customers"
        columns={columns}
        searchPlaceholder="Search by code, name, or TIN"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Customer</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input placeholder="AR-CST-001" {...form.register("code")} />
                {form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input {...form.register("name")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5"><Label>TIN</Label><Input {...form.register("tin")} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} {...form.register("currency")} /></div>
              <div className="space-y-1.5"><Label>Credit Limit</Label><Input inputMode="decimal" {...form.register("creditLimit")} /></div>
              <div className="space-y-1.5"><Label>Credit Days</Label><Input type="number" {...form.register("creditDays")} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" {...form.register("email")} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input {...form.register("phone")} /></div>
              <div className="space-y-1.5">
                <Label>Account Group</Label>
                <Select value={form.watch("accountGroup")} onValueChange={(v) => form.setValue("accountGroup", v as CustomerAccountGroup)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCT_GROUPS.map((g) => <SelectItem key={g} value={g}>{CUSTOMER_ACCOUNT_GROUP_LABEL[g]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Select value={form.watch("paymentTerm")} onValueChange={(v) => form.setValue("paymentTerm", v as PaymentTerm)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CUST_TERMS.map((t) => <SelectItem key={t} value={t}>{PAYMENT_TERM_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...form.register("taxExempt")} /> Tax exempt (diplomatic / transit)
              </label>
            </div>

            <FormSection title="General & Registration">
              <div className="space-y-1.5"><Label>Industry</Label><Input {...form.register("industry")} /></div>
              <div className="space-y-1.5"><Label>Registration No.</Label><Input {...form.register("registrationNo")} /></div>
              <div className="space-y-1.5"><Label>Search Term / Alias</Label><Input {...form.register("searchTerm")} /></div>
              <div className="space-y-1.5"><Label>Contact Person</Label><Input {...form.register("contactPerson")} /></div>
              <div className="space-y-1.5"><Label>AP Contact</Label><Input {...form.register("apContact")} /></div>
              <div className="space-y-1.5"><Label>Reconciliation Acct</Label><Input placeholder="1100" {...form.register("reconAccount")} /></div>
            </FormSection>

            <FormSection title="Address & Geocoding">
              <div className="space-y-1.5 md:col-span-2"><Label>Billing Address</Label><Input {...form.register("billingAddress")} /></div>
              <div className="space-y-1.5"><Label>City</Label><Input {...form.register("city")} /></div>
              <div className="space-y-1.5"><Label>Country (ISO)</Label><Input maxLength={2} placeholder="TZ" {...form.register("country")} /></div>
              <div className="space-y-1.5"><Label>Postal Code</Label><Input {...form.register("postalCode")} /></div>
              <div className="space-y-1.5"><Label>Transport Zone</Label><Input {...form.register("transportZone")} /></div>
              <div className="space-y-1.5"><Label>Latitude</Label><Input inputMode="decimal" {...form.register("latitude")} /></div>
              <div className="space-y-1.5"><Label>Longitude</Label><Input inputMode="decimal" {...form.register("longitude")} /></div>
              <div className="space-y-1.5"><Label>Time Zone</Label><Input placeholder="Africa/Dar_es_Salaam" {...form.register("timeZone")} /></div>
            </FormSection>

            <FormSection title="Freight Profile & Preferences">
              <div className="space-y-1.5"><Label>Shipping Conditions</Label><Input placeholder="Immediate / Normal" {...form.register("shippingConditions")} /></div>
              <div className="space-y-1.5"><Label>Means of Transport</Label><Input placeholder="FTL / Reefer…" {...form.register("meansOfTransport")} /></div>
              <div className="space-y-1.5"><Label>Incoterms</Label><OptionSelect value={form.watch("incoterms")} onChange={(v) => form.setValue("incoterms", v)} options={INCOTERMS_OPTIONS} placeholder="FOB / CIF…" /></div>
              <div className="space-y-1.5"><Label>Preferred Carrier</Label><Input {...form.register("preferredCarrier")} /></div>
              <div className="space-y-1.5"><Label>Communication Language</Label><Input {...form.register("communicationLang")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Dock / Access Restrictions</Label><Input {...form.register("dockRestrictions")} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...form.register("hazmatCertified")} /> HAZMAT certified
              </label>
            </FormSection>

            <FormSection title="Credit & Collections">
              <div className="space-y-1.5">
                <Label>Account Status</Label>
                <Select value={form.watch("accountStatus")} onValueChange={(v) => form.setValue("accountStatus", v as PartyStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CUST_STATUSES.map((s) => <SelectItem key={s} value={s}>{PARTY_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Parent Account</Label><Input {...form.register("parentAccount")} /></div>
              <div className="space-y-1.5"><Label>Credit Rating</Label><Input placeholder="e.g. D&B / internal" {...form.register("creditRating")} /></div>
              <div className="space-y-1.5"><Label>Temp. Credit Limit</Label><Input inputMode="decimal" {...form.register("tempCreditLimit")} /></div>
              <div className="space-y-1.5"><Label>Credit Review Date</Label><Input type="date" {...form.register("creditReviewDate")} /></div>
              <div className="space-y-1.5"><Label>Collection Strategy</Label><Input placeholder="High-Risk / Standard" {...form.register("collectionStrategy")} /></div>
              <div className="space-y-1.5"><Label>Collector (AR specialist)</Label><Input {...form.register("collectorId")} /></div>
              <div className="space-y-1.5"><Label>Early-pay Discount %</Label><Input type="number" step="0.01" {...form.register("discountPercent")} /></div>
              <div className="space-y-1.5"><Label>Discount Days</Label><Input type="number" {...form.register("discountDays")} /></div>
              <div className="space-y-1.5"><Label>Overdue Penalty %</Label><Input type="number" step="0.01" {...form.register("penaltyRate")} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...form.register("creditHoldOverride")} /> Allow billing over the credit limit (hold override)
              </label>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...form.register("podRequired")} /> POD required before an invoice is collectible
              </label>
            </FormSection>

            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
