"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Textarea } from "@frontend/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { jobSchema, type JobInput } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { JOB_STATUS_LABEL, JOB_STATUS_VARIANT } from "@frontend/lib/labels";
import { formatDate, formatYen } from "@frontend/lib/utils";
import type { JobStatus } from "@frontend/lib/enums";

interface Job extends JobInput { id: string; client?: { companyName: string }; }

export function JobsManager({ clients }: { clients: { id: string; companyName: string }[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const form = useForm<JobInput>({ resolver: zodResolver(jobSchema), defaultValues: { status: "PENDING" } });

  const columns: Column<Job>[] = [
    { key: "jobCode", header: "Job Code" },
    { key: "client", header: "Client", render: (r) => r.client?.companyName ?? "-" },
    { key: "deliveryAddress", header: "Delivery To" },
    { key: "deliveryDate", header: "Date", render: (r) => formatDate(r.deliveryDate as never) },
    { key: "rewardAmount", header: "Reward", render: (r) => formatYen(r.rewardAmount) },
    { key: "status", header: "Status", render: (r) => <Badge variant={JOB_STATUS_VARIANT[r.status]}>{JOB_STATUS_LABEL[r.status]}</Badge> },
  ];

  function openCreate() {
    setEditing(null);
    form.reset({ jobCode: `J-${Date.now().toString().slice(-6)}`, clientId: clients[0]?.id ?? "", pickupAddress: "", deliveryAddress: "", cargoDescription: "", rewardAmount: 0, status: "PENDING", deliveryDate: new Date() as never });
    setOpen(true);
  }
  function openEdit(j: Job) {
    setEditing(j);
    form.reset({ ...j, deliveryDate: String(j.deliveryDate).slice(0, 10) as never });
    setOpen(true);
  }

  async function onSubmit(data: JobInput) {
    try {
      const path = editing ? `/api/jobs/${editing.id}` : "/api/jobs";
      await apiFetch(path, { method: editing ? "PATCH" : "POST", body: JSON.stringify(data) });
      toast({ title: "Saved", variant: "success" });
      setOpen(false); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function onDelete(j: Job) {
    if (!confirm(`Delete ${j.jobCode}?`)) return;
    try {
      await apiFetch(`/api/jobs/${j.id}`, { method: "DELETE" });
      toast({ title: "Deleted", variant: "success" }); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to delete", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Job>
        endpoint="/api/jobs"
        columns={columns}
        searchPlaceholder="Search by code, address, or cargo"
        filters={{ status: statusFilter }}
        refreshKey={refreshKey}
        toolbar={
          <>
            <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {Object.entries(JOB_STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" asChild>
              <a href={`/api/exports/jobs-csv${statusFilter ? `?status=${statusFilter}` : ""}`}><Download className="h-4 w-4" />CSV</a>
            </Button>
            <Button onClick={openCreate}><Plus className="h-4 w-4" />New</Button>
          </>
        }
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Job" : "New Job"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <F label="Job Code"><Input {...form.register("jobCode")} /></F>
              <F label="Client">
                <Select defaultValue={form.getValues("clientId")} onValueChange={(v) => form.setValue("clientId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            </div>
            <F label="Pickup Address"><Input {...form.register("pickupAddress")} /></F>
            <F label="Delivery Address"><Input {...form.register("deliveryAddress")} /></F>
            <div className="grid grid-cols-2 gap-3">
              <F label="Delivery Date"><Input type="date" {...form.register("deliveryDate")} /></F>
              <F label="Reward"><Input type="number" {...form.register("rewardAmount")} /></F>
            </div>
            <F label="Cargo"><Input {...form.register("cargoDescription")} /></F>
            <F label="Note"><Textarea {...form.register("note")} /></F>
            {editing && (
              <F label="Status">
                <Select defaultValue={form.getValues("status")} onValueChange={(v) => form.setValue("status", v as JobStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(JOB_STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            )}
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
