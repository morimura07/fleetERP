"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { driverSchema, type DriverInput } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { CONTRACT_LABEL, DRIVER_STATUS_LABEL } from "@frontend/lib/labels";
import { formatDate } from "@frontend/lib/utils";
import type { DriverStatus, ContractType } from "@frontend/lib/enums";

interface Driver {
  id: string; version: number; name: string; email: string; phone: string; address: string;
  contractType: ContractType; joinedAt: string; status: DriverStatus;
}

const STATUS_VARIANT: Record<DriverStatus, "success" | "warning" | "secondary"> = {
  ACTIVE: "success", VACATION: "warning", INACTIVE: "secondary",
};

export function DriversManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const form = useForm<DriverInput>({
    resolver: zodResolver(driverSchema),
    defaultValues: { contractType: "CONTRACTOR", status: "ACTIVE" },
  });

  const columns: Column<Driver>[] = [
    { key: "name", header: "Name" },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    { key: "contractType", header: "Contract", render: (r) => CONTRACT_LABEL[r.contractType] },
    { key: "joinedAt", header: "Joined", render: (r) => formatDate(r.joinedAt) },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{DRIVER_STATUS_LABEL[r.status]}</Badge> },
  ];

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", email: "", phone: "", address: "", contractType: "CONTRACTOR", status: "ACTIVE", joinedAt: new Date() as never });
    setOpen(true);
  }
  function openEdit(d: Driver) {
    setEditing(d);
    form.reset({ ...d, joinedAt: d.joinedAt.slice(0, 10) as never });
    setOpen(true);
  }

  async function onSubmit(data: DriverInput) {
    try {
      const path = editing ? `/api/drivers/${editing.id}` : "/api/drivers";
      const payload = editing ? { ...data, version: editing.version } : data;
      await apiFetch(path, { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
      toast({ title: "Saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function onDelete(d: Driver) {
    if (!confirm(`Delete ${d.name}?`)) return;
    try {
      await apiFetch(`/api/drivers/${d.id}`, { method: "DELETE" });
      toast({ title: "Deleted", variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to delete", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Driver>
        endpoint="/api/drivers"
        columns={columns}
        searchPlaceholder="Search by name, email, or phone"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New</Button>}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <Button asChild variant="ghost" size="icon" title="Availability & holidays">
              <Link href={`/drivers/${row.id}`}><Settings2 className="h-4 w-4" /></Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Driver" : "New Driver"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <Field label="Name"><Input {...form.register("name")} /></Field>
            <Field label="Email"><Input type="email" {...form.register("email")} /></Field>
            <Field label="Phone"><Input {...form.register("phone")} /></Field>
            <Field label="Address"><Input {...form.register("address")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contract Type">
                <Select defaultValue={form.getValues("contractType")} onValueChange={(v) => form.setValue("contractType", v as ContractType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONTRACT_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select defaultValue={form.getValues("status")} onValueChange={(v) => form.setValue("status", v as DriverStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DRIVER_STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Join Date"><Input type="date" {...form.register("joinedAt")} /></Field>
            {!editing && (
              <div className="rounded-md border p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...form.register("createLogin")} /> Create a login account
                </label>
                <Field label="Initial Password (min 8 chars)"><Input type="password" {...form.register("password")} /></Field>
              </div>
            )}
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
