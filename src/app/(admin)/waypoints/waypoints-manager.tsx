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
import { waypointSchema, type WaypointInput } from "@/lib/validations";
import { apiFetch, ApiError } from "@/lib/fetcher";

interface Waypoint { id: string; code: string; name: string; kind: string; lat: string; lng: string; country: string | null; }

const KINDS = ["CHECKPOINT", "BORDER", "WEIGHBRIDGE", "DEPOT"] as const;
const KIND_LABEL: Record<string, string> = { CHECKPOINT: "Checkpoint", BORDER: "Border", WEIGHBRIDGE: "Weighbridge", DEPOT: "Depot" };

const columns: Column<Waypoint>[] = [
  { key: "code", header: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
  { key: "name", header: "Name" },
  { key: "kind", header: "Kind", render: (r) => <Badge variant="outline">{KIND_LABEL[r.kind] ?? r.kind}</Badge> },
  { key: "coords", header: "Coordinates", render: (r) => <span className="tabular-nums text-xs">{Number(r.lat).toFixed(4)}, {Number(r.lng).toFixed(4)}</span> },
  { key: "country", header: "Country", render: (r) => r.country || "—" },
];

export function WaypointsManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<WaypointInput>({ resolver: zodResolver(waypointSchema) });

  function openCreate() {
    form.reset({ code: "", name: "", kind: "CHECKPOINT", lat: 0, lng: 0, country: "", isActive: true });
    setOpen(true);
  }

  async function onSubmit(data: WaypointInput) {
    try {
      await apiFetch("/api/waypoints", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Waypoint saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Waypoint>
        endpoint="/api/waypoints"
        columns={columns}
        searchPlaceholder="Search by code or name"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Waypoint</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New GPS Waypoint</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input placeholder="MALABA" {...form.register("code")} />
                {form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="Malaba Border Post" {...form.register("name")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select value={form.watch("kind")} onValueChange={(v) => form.setValue("kind", v as WaypointInput["kind"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Country</Label><Input placeholder="Kenya" {...form.register("country")} /></div>
              <div className="space-y-1.5">
                <Label>Latitude</Label>
                <Input type="number" step="any" placeholder="0.636" {...form.register("lat")} />
                {form.formState.errors.lat && <p className="text-xs text-destructive">{form.formState.errors.lat.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Longitude</Label>
                <Input type="number" step="any" placeholder="34.275" {...form.register("lng")} />
                {form.formState.errors.lng && <p className="text-xs text-destructive">{form.formState.errors.lng.message}</p>}
              </div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
