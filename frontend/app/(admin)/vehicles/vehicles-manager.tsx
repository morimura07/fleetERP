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
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import { vehicleSchema, maintenanceSchema, type VehicleInput } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { VEHICLE_STATUS_LABEL, OWNERSHIP_STATUS_LABEL, FUEL_TYPE_LABEL } from "@frontend/lib/labels";
import { formatDate, formatYen } from "@frontend/lib/utils";
import type { VehicleStatus, OwnershipStatus, FuelType } from "@frontend/lib/enums";
import { z } from "zod";

const OWNERSHIPS = Object.keys(OWNERSHIP_STATUS_LABEL) as OwnershipStatus[];
const FUEL_TYPES = Object.keys(FUEL_TYPE_LABEL) as FuelType[];

interface Vehicle {
  id: string; version: number; vehicleNumber: string; plateNumber: string; maker: string; model: string;
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

  function openCreate() { setEditing(null); form.reset({ vehicleNumber: "", plateNumber: "", maker: "", model: "", status: "AVAILABLE", insuranceExpiry: new Date() as never, inspectionExpiry: new Date() as never, ownershipStatus: "OWNED" }); setOpen(true); }
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
      const payload = editing ? { ...data, version: editing.version } : data;
      await apiFetch(path, { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
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
        <DialogContent className="max-w-2xl">
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

            <FormSection title="Identification & Specs">
              <div className="space-y-1.5"><Label>VIN / Chassis</Label><Input {...form.register("vin")} /></div>
              <div className="space-y-1.5"><Label>Year</Label><Input type="number" {...form.register("yearMade")} /></div>
              <div className="space-y-1.5"><Label>Vehicle Type</Label><Input placeholder="Flatbed / Tanker…" {...form.register("vehicleType")} /></div>
              <div className="space-y-1.5"><Label>Body Type</Label><Input placeholder="rigid / articulated" {...form.register("bodyType")} /></div>
            </FormSection>

            <FormSection title="Physical & Technical">
              <div className="space-y-1.5"><Label>Tare Weight (kg)</Label><Input inputMode="decimal" {...form.register("tareWeightKg")} /></div>
              <div className="space-y-1.5"><Label>GVW (kg)</Label><Input inputMode="decimal" {...form.register("gvwKg")} /></div>
              <div className="space-y-1.5"><Label>Payload (kg)</Label><Input inputMode="decimal" {...form.register("payloadKg")} /></div>
              <div className="space-y-1.5"><Label>Loading Volume (CBM)</Label><Input inputMode="decimal" {...form.register("loadingVolumeCbm")} /></div>
              <div className="space-y-1.5"><Label>Dimensions (L×W×H)</Label><Input {...form.register("dimensions")} /></div>
              <div className="space-y-1.5"><Label>Axles</Label><Input type="number" {...form.register("axleCount")} /></div>
              <div className="space-y-1.5"><Label>Suspension</Label><Input placeholder="Leaf / Air" {...form.register("suspensionType")} /></div>
            </FormSection>

            <FormSection title="Compliance & Licensing">
              <div className="space-y-1.5"><Label>Registration Expiry</Label><Input type="date" {...form.register("registrationExpiry")} /></div>
              <div className="space-y-1.5"><Label>Insurance Policy No.</Label><Input {...form.register("insurancePolicyNo")} /></div>
              <div className="space-y-1.5"><Label>Emission Rating</Label><Input placeholder="Euro VI" {...form.register("emissionRating")} /></div>
              <div className="space-y-1.5"><Label>Operating Permit</Label><Input placeholder="LATRA…" {...form.register("operatingPermit")} /></div>
              <div className="space-y-1.5"><Label>COMESA Permit Expiry</Label><Input type="date" {...form.register("comesaPermitExpiry")} /></div>
              <div className="space-y-1.5"><Label>Yellow Card Expiry</Label><Input type="date" {...form.register("yellowCardExpiry")} /></div>
            </FormSection>

            <FormSection title="Operations & Telematics">
              <div className="space-y-1.5">
                <Label>Ownership</Label>
                <Select value={form.watch("ownershipStatus")} onValueChange={(v) => form.setValue("ownershipStatus", v as OwnershipStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OWNERSHIPS.map((o) => <SelectItem key={o} value={o}>{OWNERSHIP_STATUS_LABEL[o]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fuel Type</Label>
                <Select value={form.watch("fuelType") ?? undefined} onValueChange={(v) => form.setValue("fuelType", v as FuelType)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{FUEL_TYPE_LABEL[f]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Transporter (if leased)</Label><Input {...form.register("transporterName")} /></div>
              <div className="space-y-1.5"><Label>Fuel Card No.</Label><Input {...form.register("fuelCardNumber")} /></div>
              <div className="space-y-1.5"><Label>Telematics / GPS ID</Label><Input {...form.register("telematicsId")} /></div>
              <div className="space-y-1.5"><Label>Home Terminal</Label><Input {...form.register("homeTerminal")} /></div>
              <div className="space-y-1.5"><Label>Assigned Driver</Label><Input {...form.register("assignedDriver")} /></div>
              <div className="space-y-1.5"><Label>Fuel Target (km/L)</Label><Input inputMode="decimal" {...form.register("fuelTargetKmPerL")} /></div>
            </FormSection>

            <FormSection title="Maintenance & Asset">
              <div className="space-y-1.5"><Label>Odometer (km)</Label><Input type="number" {...form.register("odometerKm")} /></div>
              <div className="space-y-1.5"><Label>Engine No.</Label><Input {...form.register("engineNumber")} /></div>
              <div className="space-y-1.5"><Label>Tyre Size</Label><Input {...form.register("tyreSize")} /></div>
              <div className="space-y-1.5"><Label>Battery Spec</Label><Input {...form.register("batterySpec")} /></div>
              <div className="space-y-1.5"><Label>Last Service Date</Label><Input type="date" {...form.register("lastServiceDate")} /></div>
              <div className="space-y-1.5"><Label>Last Service (km)</Label><Input type="number" {...form.register("lastServiceKm")} /></div>
              <div className="space-y-1.5"><Label>Asset Account Code</Label><Input placeholder="1500" {...form.register("assetAccountCode")} /></div>
              <div className="space-y-1.5"><Label>Purchase Date</Label><Input type="date" {...form.register("purchaseDate")} /></div>
              <div className="space-y-1.5"><Label>Purchase Price</Label><Input inputMode="decimal" {...form.register("purchasePrice")} /></div>
              <div className="space-y-1.5"><Label>Depreciation Method</Label><Input placeholder="straight-line" {...form.register("depreciationMethod")} /></div>
            </FormSection>

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
