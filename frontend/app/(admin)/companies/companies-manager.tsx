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
import { companySchema, type CompanyInput } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

interface Company extends CompanyInput { id: string; version: number; }

export function CompaniesManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<CompanyInput>({ resolver: zodResolver(companySchema) });

  function openCreate() {
    form.reset({ code: "", name: "", baseCurrency: "USD", country: "TZ", isActive: true });
    setOpen(true);
  }

  async function onSubmit(data: CompanyInput) {
    try {
      await apiFetch("/api/companies", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Company created", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<Company>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono font-medium">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "baseCurrency", header: "Currency" },
    { key: "country", header: "Country" },
    { key: "isActive", header: "Status", render: (r) => (r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>) },
  ];

  return (
    <>
      <DataTable<Company>
        endpoint="/api/companies"
        columns={columns}
        searchPlaceholder="Search by code or name"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Company</Button>}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Company</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code (used as the data partition)</Label>
                <Input placeholder="KE01" {...form.register("code")} onChange={(e) => form.setValue("code", e.target.value.toUpperCase())} />
                {form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="Kenya Operations Ltd" {...form.register("name")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5"><Label>Base Currency</Label><Input maxLength={3} {...form.register("baseCurrency")} /></div>
              <div className="space-y-1.5"><Label>Country (ISO)</Label><Input maxLength={2} {...form.register("country")} /></div>
            </div>
            <p className="text-xs text-muted-foreground">The code becomes this company&apos;s data partition and can&apos;t be changed after creation.</p>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
