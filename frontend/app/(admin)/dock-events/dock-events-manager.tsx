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
import { useToast } from "@frontend/components/ui/toast";
import { dockEventSchema, type DockEventInput } from "@frontend/lib/validations";
import { DOCK_EVENT_KIND_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { DockEventKind } from "@frontend/lib/enums";

type Vehicle = { id: string; plateNumber: string; model: string };
type Trip = { id: string; tripCode: string };

interface DockEventRow {
  id: string; kind: DockEventKind; facility: string | null; eventAt: string; note: string | null;
  vehicle: { plateNumber: string; model: string };
}

const KINDS: DockEventKind[] = ["ARRIVAL", "DEPARTURE"];
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function nowLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const columns: Column<DockEventRow>[] = [
  { key: "eventAt", header: "When", render: (r) => <span className="tabular-nums text-xs">{fmt(r.eventAt)}</span> },
  { key: "vehicle", header: "Vehicle", render: (r) => <span className="font-mono">{r.vehicle.plateNumber}</span> },
  { key: "kind", header: "Event", render: (r) => <Badge variant={r.kind === "ARRIVAL" ? "info" : "secondary"}>{DOCK_EVENT_KIND_LABEL[r.kind]}</Badge> },
  { key: "facility", header: "Facility", render: (r) => r.facility || "—" },
  { key: "note", header: "Note", render: (r) => <span className="text-xs text-muted-foreground">{r.note || "—"}</span> },
];

export function DockEventsManager({ vehicles, trips }: { vehicles: Vehicle[]; trips: Trip[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<DockEventInput>({ resolver: zodResolver(dockEventSchema) });

  function openCreate() {
    form.reset({ vehicleId: "", tripId: "", facility: "", kind: "ARRIVAL", eventAt: nowLocal() as unknown as Date, note: "" });
    setOpen(true);
  }

  async function onSubmit(data: DockEventInput) {
    try {
      await apiFetch("/api/operational-kpi/dock-events", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Dock event recorded", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<DockEventRow>
        endpoint="/api/operational-kpi/dock-events"
        columns={columns}
        searchPlaceholder="Search facility or note"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />Record Event</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Dock Event</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Vehicle</Label>
                <Select value={form.watch("vehicleId")} onValueChange={(v) => form.setValue("vehicleId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plateNumber} · {v.model}</SelectItem>)}</SelectContent>
                </Select>
                {form.formState.errors.vehicleId && <p className="text-xs text-destructive">{form.formState.errors.vehicleId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Event</Label>
                <Select value={form.watch("kind")} onValueChange={(v) => form.setValue("kind", v as DockEventKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{DOCK_EVENT_KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Event Time</Label>
                <Input type="datetime-local" {...form.register("eventAt")} />
                {form.formState.errors.eventAt && <p className="text-xs text-destructive">{form.formState.errors.eventAt.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Facility</Label>
                <Input placeholder="Dar es Salaam Yard" {...form.register("facility")} />
              </div>
              <div className="space-y-1.5">
                <Label>Trip (optional)</Label>
                <Select value={form.watch("tripId") || "none"} onValueChange={(v) => form.setValue("tripId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Link a trip" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {trips.map((t) => <SelectItem key={t.id} value={t.id}>{t.tripCode}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Note</Label>
                <Input placeholder="Waiting for weighbridge" {...form.register("note")} />
              </div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
