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
import { vendorSchema, type VendorInput } from "@/lib/validations";
import { VENDOR_GROUP_LABEL, PAYMENT_TERM_LABEL } from "@/lib/labels";
import { apiFetch, ApiError } from "@/lib/fetcher";
import type { VendorGroup, PaymentTerm } from "@prisma/client";

interface Vendor extends VendorInput { id: string; }

const GROUPS = Object.keys(VENDOR_GROUP_LABEL) as VendorGroup[];
const TERMS = Object.keys(PAYMENT_TERM_LABEL) as PaymentTerm[];

const columns: Column<Vendor>[] = [
  { key: "code", header: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
  { key: "legalName", header: "Legal Name" },
  { key: "group", header: "Group", render: (r) => <Badge variant="outline">{VENDOR_GROUP_LABEL[r.group as VendorGroup]}</Badge> },
  { key: "paymentTerm", header: "Terms", render: (r) => PAYMENT_TERM_LABEL[r.paymentTerm as PaymentTerm] },
  { key: "tin", header: "TIN", render: (r) => r.tin || "—" },
  { key: "isActive", header: "Status", render: (r) => r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
];

export function VendorsManager() {
  const { toast } = useToast();
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
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} {...form.register("currency")} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" {...form.register("email")} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input {...form.register("phone")} /></div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
