"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Contact } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { PartyProfilePanel } from "@frontend/components/data/party-profile-panel";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import { vendorSchema, type VendorInput } from "@frontend/lib/validations";
import { VENDOR_GROUP_LABEL, PAYMENT_TERM_LABEL, PAYMENT_METHOD_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { VendorGroup, PaymentTerm, PaymentMethod, AvlStatus, AvlRegion, KycStatus } from "@frontend/lib/enums";
import { AVL_STATUS_LABEL, AVL_STATUS_VARIANT, KYC_STATUS_LABEL } from "@frontend/lib/labels";
import { AvlDialog } from "./avl-dialog";
import { ShieldCheck } from "lucide-react";

interface Vendor extends VendorInput { id: string; avlStatus: AvlStatus; avlRegion: AvlRegion | null; kycStatus: KycStatus; kycVerifiedAt: string | null; kycNote: string | null; categories: string[]; }

const GROUPS = Object.keys(VENDOR_GROUP_LABEL) as VendorGroup[];
const TERMS = Object.keys(PAYMENT_TERM_LABEL) as PaymentTerm[];
const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

const columns: Column<Vendor>[] = [
  { key: "code", header: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
  { key: "legalName", header: "Legal Name" },
  { key: "group", header: "Group", render: (r) => <Badge variant="outline">{VENDOR_GROUP_LABEL[r.group as VendorGroup]}</Badge> },
  { key: "paymentTerm", header: "Terms", render: (r) => PAYMENT_TERM_LABEL[r.paymentTerm as PaymentTerm] },
  { key: "tin", header: "TIN", render: (r) => r.tin || "—" },
  { key: "avlStatus", header: "AVL", render: (r) => <span className="flex flex-wrap gap-1"><Badge variant={AVL_STATUS_VARIANT[r.avlStatus]}>{AVL_STATUS_LABEL[r.avlStatus]}</Badge><span className="text-xs text-muted-foreground">KYC {KYC_STATUS_LABEL[r.kycStatus].toLowerCase()}</span></span> },
  { key: "isActive", header: "Status", render: (r) => r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
];

export function VendorsManager() {
  const { toast } = useToast();
  const [profileFor, setProfileFor] = useState<Vendor | null>(null);
  const [avlFor, setAvlFor] = useState<Vendor | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<VendorInput>({ resolver: zodResolver(vendorSchema) });

  function openCreate() {
    form.reset({ dataAreaId: "HQ01", code: "", legalName: "", group: "OTHER", paymentTerm: "NET_30", currency: "USD", isActive: true });
    setOpen(true);
  }

  async function onSubmit(data: VendorInput) {
    try {
      await apiFetch("/api/vendors", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Vendor saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Vendor>
        endpoint="/api/vendors"
        columns={columns}
        searchPlaceholder="Search by code, name, or TIN"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Vendor</Button>}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" title="Approved vendor list and KYC" onClick={() => setAvlFor(row)}>
              <ShieldCheck className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Locations and contacts" onClick={() => setProfileFor(row)}>
              <Contact className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Vendor</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input placeholder="AP-VND-001" {...form.register("code")} />
                {form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Legal Name</Label>
                <Input {...form.register("legalName")} />
                {form.formState.errors.legalName && <p className="text-xs text-destructive">{form.formState.errors.legalName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Group</Label>
                <Select value={form.watch("group")} onValueChange={(v) => form.setValue("group", v as VendorGroup)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GROUPS.map((g) => <SelectItem key={g} value={g}>{VENDOR_GROUP_LABEL[g]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Select value={form.watch("paymentTerm")} onValueChange={(v) => form.setValue("paymentTerm", v as PaymentTerm)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{PAYMENT_TERM_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>TIN</Label><Input {...form.register("tin")} /></div>
              <div className="space-y-1.5"><Label>VAT Reg. No.</Label><Input {...form.register("vrn")} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><CurrencySelect value={form.watch("currency")} onChange={(v) => form.setValue("currency", v)} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" {...form.register("email")} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input {...form.register("phone")} /></div>
              <div className="space-y-1.5"><Label>Operating Name (DBA)</Label><Input {...form.register("operatingName")} /></div>
              <div className="space-y-1.5"><Label>Search Term / Alias</Label><Input {...form.register("searchTerm")} /></div>
              <div className="space-y-1.5"><Label>Parent / Holding Co.</Label><Input {...form.register("parentCompany")} /></div>
            </div>

            <FormSection title="Contact & Compliance">
              <div className="space-y-1.5 md:col-span-2"><Label>HQ Address</Label><Input {...form.register("address")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Branch Address</Label><Input {...form.register("branchAddress")} /></div>
              <div className="space-y-1.5"><Label>Contact Person</Label><Input {...form.register("contactPerson")} /></div>
              <div className="space-y-1.5"><Label>Billing Contact</Label><Input {...form.register("billingContact")} /></div>
              <div className="space-y-1.5"><Label>Insurance Policy No.</Label><Input {...form.register("insurancePolicy")} /></div>
              <div className="space-y-1.5"><Label>Insurance Expiry</Label><Input type="date" {...form.register("insuranceExpiry")} /></div>
              <div className="space-y-1.5"><Label>Licence / Authority No.</Label><Input {...form.register("licenseNumber")} /></div>
            </FormSection>

            <FormSection title="Financial">
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={form.watch("paymentMethod") ?? undefined} onValueChange={(v) => form.setValue("paymentMethod", v as PaymentMethod)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Reconciliation Acct</Label><Input placeholder="2000" {...form.register("reconAccount")} /></div>
              <div className="space-y-1.5"><Label>Bank Name</Label><Input {...form.register("bankName")} /></div>
              <div className="space-y-1.5"><Label>SWIFT</Label><Input {...form.register("bankSwift")} /></div>
              <div className="space-y-1.5"><Label>IBAN</Label><Input {...form.register("bankIban")} /></div>
              <div className="space-y-1.5"><Label>Mobile Money</Label><Input {...form.register("mobileMoney")} /></div>
            </FormSection>

            <FormSection title="Transport / TMS">
              <div className="space-y-1.5"><Label>SCAC Code</Label><Input {...form.register("scacCode")} /></div>
              <div className="space-y-1.5"><Label>MC / DOT No.</Label><Input {...form.register("mcDotNumber")} /></div>
              <div className="space-y-1.5"><Label>Fleet Size</Label><Input type="number" {...form.register("fleetSize")} /></div>
              <div className="space-y-1.5"><Label>Equipment Types</Label><Input placeholder="Flatbed, Reefer…" {...form.register("equipmentTypes")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Rate Agreement / FSC</Label><Input {...form.register("rateAgreement")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>EDI / API Endpoint</Label><Input {...form.register("ediEndpoint")} /></div>
            </FormSection>

            <FormSection title="Credit, Tax & Customs">
              <div className="space-y-1.5"><Label>Credit Limit</Label><Input inputMode="decimal" {...form.register("creditLimit")} /></div>
              <div className="space-y-1.5"><Label>Tax Jurisdiction</Label><Input placeholder="TZ-DSM" {...form.register("taxJurisdiction")} /></div>
              <div className="space-y-1.5"><Label>Safety Rating</Label><Input {...form.register("safetyRating")} /></div>
              <div className="space-y-1.5"><Label>Customs Broker Code</Label><Input {...form.register("customsBrokerCode")} /></div>
              <div className="space-y-1.5"><Label>Customs Bond Number</Label><Input {...form.register("customsBondNumber")} /></div>
            </FormSection>

            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {avlFor && <AvlDialog vendor={avlFor} onClose={() => setAvlFor(null)} onSaved={() => setRefreshKey((k) => k + 1)} />}
      <Dialog open={profileFor !== null} onOpenChange={(o) => !o && setProfileFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{profileFor?.legalName}</DialogTitle></DialogHeader>
          {profileFor && <PartyProfilePanel partyType="vendors" partyId={profileFor.id} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
