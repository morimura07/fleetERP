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
import { useToast } from "@frontend/components/ui/toast";
import { customerSchema, type CustomerInput } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

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
    form.reset({ dataAreaId: "HQ01", code: "", name: "", creditLimit: "0", creditDays: 30, taxExempt: false, currency: "USD", isActive: true });
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
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...form.register("taxExempt")} /> Tax exempt (diplomatic / transit)
              </label>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
