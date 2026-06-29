"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Wrench } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { vehicleSchema, maintenanceSchema, type VehicleInput } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { VEHICLE_STATUS_LABEL } from "@frontend/lib/labels";
import { formatDate, formatYen } from "@frontend/lib/utils";
import type { VehicleStatus } from "@frontend/lib/enums";
import { z } from "zod";

interface Vehicle {
  id: string; vehicleNumber: string; plateNumber: string; maker: string; model: string;
  insuranceExpiry: string; inspectionExpiry: string; status: VehicleStatus;
}
interface Maintenance { id: string; maintenanceType: string; date: string; cost: number; note: string | null; }

const STATUS_VARIANT: Record<VehicleStatus, "success" | "warning" | "secondary"> = {
  AVAILABLE: "success", MAINTENANCE: "warning", UNAVAILABLE: "secondary",
};

export function VehiclesManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [maintVehicle, setMaintVehicle] = useState<Vehicle | null>(null);
  const [maintList, setMaintList] = useState<Maintenance[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const form = useForm<VehicleInput>({ resolver: zodResolver(vehicleSchema), defaultValues: { status: "AVAILABLE" } });
  const maintForm = useForm<z.infer<typeof maintenanceSchema>>({ resolver: zodResolver(maintenanceSchema) });

  const columns: Column<Vehicle>[] = [
    { key: "vehicleNumber", header: "Vehicle No." },
    { key: "plateNumber", header: "Plate" },
    { key: "maker", header: "Maker" },
    { key: "model", header: "Model" },
    { key: "inspectionExpiry", header: "Inspection Expiry", render: (r) => formatDate(r.inspectionExpiry) },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{VEHICLE_STATUS_LABEL[r.status]}</Badge> },
  ];

  function openCreate() { setEditing(null); form.reset({ vehicleNumber: "", plateNumber: "", maker: "", model: "", status: "AVAILABLE", insuranceExpiry: new Date() as never, inspectionExpiry: new Date() as never }); setOpen(true); }
  function openEdit(v: Vehicle) { setEditing(v); form.reset({ ...v, insuranceExpiry: v.insuranceExpiry.slice(0, 10) as never, inspectionExpiry: v.inspectionExpiry.slice(0, 10) as never }); setOpen(true); }

  async function openMaint(v: Vehicle) {
    setMaintVehicle(v);
    maintForm.reset({ maintenanceType: "", date: new Date() as never, cost: 0 });
    const list = await apiFetch<Maintenance[]>(`/api/vehicles/${v.id}/maintenances`);
    setMaintList(list);
    setMaintOpen(true);
  }

  async function onSubmit(data: VehicleInput) {
    try {
      const path = editing ? `/api/vehicles/${editing.id}` : "/api/vehicles";
      await apiFetch(path, { method: editing ? "PATCH" : "POST", body: JSON.stringify(data) });
      toast({ title: "Saved", variant: "success" });
      setOpen(false); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function addMaint(data: z.infer<typeof maintenanceSchema>) {
    if (!maintVehicle) return;
    const created = await apiFetch<Maintenance>(`/api/vehicles/${maintVehicle.id}/maintenances`, { method: "POST", body: JSON.stringify(data) });
    setMaintList((l) => [created, ...l]);
    maintForm.reset({ maintenanceType: "", date: new Date() as never, cost: 0 });
    toast({ title: "Maintenance record added", variant: "success" });
  }

  async function onDelete(v: Vehicle) {
    if (!confirm(`Delete ${v.vehicleNumber}?`)) return;
    try {
      await apiFetch(`/api/vehicles/${v.id}`, { method: "DELETE" });
      toast({ title: "Deleted", variant: "success" }); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to delete", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Vehicle>
        endpoint="/api/vehicles"
        columns={columns}
        searchPlaceholder="Search by number, maker, or model"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New</Button>}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" title="Maintenance" onClick={() => openMaint(row)}><Wrench className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Vehicle" : "New Vehicle"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <F label="Vehicle No."><Input {...form.register("vehicleNumber")} /></F>
            <F label="Plate Number"><Input {...form.register("plateNumber")} /></F>
            <div className="grid grid-cols-2 gap-3">
              <F label="Maker"><Input {...form.register("maker")} /></F>
              <F label="Model"><Input {...form.register("model")} /></F>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label="Insurance Expiry"><Input type="date" {...form.register("insuranceExpiry")} /></F>
              <F label="Inspection Expiry"><Input type="date" {...form.register("inspectionExpiry")} /></F>
            </div>
            <F label="Status">
              <Select defaultValue={form.getValues("status")} onValueChange={(v) => form.setValue("status", v as VehicleStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(VEHICLE_STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={maintOpen} onOpenChange={setMaintOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Maintenance — {maintVehicle?.vehicleNumber}</DialogTitle></DialogHeader>
          <form onSubmit={maintForm.handleSubmit(addMaint)} className="grid grid-cols-2 gap-3">
            <F label="Type"><Input {...maintForm.register("maintenanceType")} /></F>
            <F label="Date"><Input type="date" {...maintForm.register("date")} /></F>
            <F label="Cost"><Input type="number" {...maintForm.register("cost")} /></F>
            <F label="Note"><Input {...maintForm.register("note")} /></F>
            <div className="col-span-2"><Button type="submit" size="sm">Add</Button></div>
          </form>
          <div className="max-h-60 overflow-y-auto">
            {maintList.map((m) => (
              <div key={m.id} className="flex justify-between border-b py-2 text-sm">
                <span>{formatDate(m.date)} — {m.maintenanceType}</span>
                <span>{formatYen(m.cost)}</span>
              </div>
            ))}
            {maintList.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No records</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
