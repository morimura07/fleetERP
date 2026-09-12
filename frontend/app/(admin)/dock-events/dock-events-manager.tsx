"use client";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { KpiRibbon } from "@frontend/components/data/kpi-ribbon";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import { dockEventSchema, type DockEventInput } from "@frontend/lib/validations";
import { DOCK_EVENT_KIND_LABEL, DOCK_ACTIVITY_LABEL, DOCK_SOURCE_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { DockEventKind, DockActivity, DockSource } from "@frontend/lib/enums";

type Vehicle = { id: string; plateNumber: string; model: string; vehicleNumber: string };
type Trip = { id: string; tripCode: string };
type Driver = { id: string; name: string };

interface DockEventRow {
  id: string; kind: DockEventKind; facility: string | null; eventAt: string; note: string | null;
  vehicle: { plateNumber: string; model: string; vehicleNumber: string };
  driver: { name: string } | null;
  trip: { tripCode: string } | null;
  trailerNumber: string | null; dockBay: string | null; activity: DockActivity;
  sealNumber: string | null; sealIntact: boolean | null;
  odometerKm: number | null; fuelLevel: string | null; source: DockSource;
  // Computed server-side by pairing arrival with departure, never stored.
  dwellHours: number | null; detentionHours: number | null;
}

/** "3h 45m", or a dash while the truck is still on site. */
function dwell(hours: number | null): string {
  if (hours == null) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const KINDS: DockEventKind[] = ["ARRIVAL", "DEPARTURE"];
// Mirrors DEFAULT_FREE_HOURS on the server; shown so the figure explains itself.
const FREE_HOURS = 4;
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function nowLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const columns: Column<DockEventRow>[] = [
  { key: "eventAt", header: "When", render: (r) => <span className="tabular-nums text-xs">{fmt(r.eventAt)}</span> },
  {
    key: "vehicle", header: "Vehicle / Trailer",
    render: (r) => (
      <span className="font-mono text-xs">
        {r.vehicle.vehicleNumber}
        {r.trailerNumber ? <span className="text-muted-foreground"> / {r.trailerNumber}</span> : null}
      </span>
    ),
  },
  { key: "trip", header: "Trip", render: (r) => <span className="font-mono text-xs">{r.trip?.tripCode ?? "—"}</span> },
  { key: "driver", header: "Driver", render: (r) => r.driver?.name ?? "—" },
  { key: "kind", header: "Event", render: (r) => <Badge variant={r.kind === "ARRIVAL" ? "info" : "secondary"}>{DOCK_EVENT_KIND_LABEL[r.kind]}</Badge> },
  { key: "activity", header: "Activity", render: (r) => <span className="text-xs">{DOCK_ACTIVITY_LABEL[r.activity]}</span> },
  { key: "dockBay", header: "Bay / Gate", render: (r) => r.dockBay || "—" },
  {
    key: "dwellHours", header: "Dwell",
    render: (r) => (
      <span className="tabular-nums text-xs">
        {dwell(r.dwellHours)}
        {r.detentionHours ? (
          <span className="ml-2 font-semibold text-destructive">+{dwell(r.detentionHours)} billable</span>
        ) : null}
      </span>
    ),
  },
  { key: "sealNumber", header: "Seal", render: (r) => (
      <span className="text-xs">
        {r.sealNumber || "—"}
        {r.sealIntact === false ? <span className="ml-1.5 text-destructive">broken</span> : null}
      </span>
    ) },
  { key: "source", header: "Source", render: (r) => <span className="text-xs text-muted-foreground">{DOCK_SOURCE_LABEL[r.source]}</span> },
];

interface DockSummary {
  avgDwellHours: number | null;
  activeAtDocks: number;
  detentionAlerts: number;
  onTimeGatePassesPct: number | null;
  closedVisits: number;
}

const VIEWS = [
  { value: "ALL", label: "All events" },
  { value: "INSIDE", label: "Currently inside" },
  { value: "ARRIVALS", label: "Arrivals only" },
  { value: "DEPARTURES", label: "Departures only" },
] as const;

const SHIFTS = [
  { value: "ALL", label: "All shifts" },
  { value: "DAY", label: "Day shift" },
  { value: "NIGHT", label: "Night shift" },
] as const;

export function DockEventsManager({ vehicles, trips, drivers }: { vehicles: Vehicle[]; trips: Trip[]; drivers: Driver[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<string>("ALL");
  const [shift, setShift] = useState<string>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [facility, setFacility] = useState<string>("ALL");
  const [facilities, setFacilities] = useState<string[]>([]);
  const form = useForm<DockEventInput>({ resolver: zodResolver(dockEventSchema) });

  // Facilities are whatever has actually been recorded, so the filter can never
  // offer a yard with no events behind it.
  useEffect(() => {
    let live = true;
    apiFetch<string[]>("/api/operational-kpi/dock-events/facilities")
      .then((f) => { if (live) setFacilities(f); })
      .catch(() => { if (live) setFacilities([]); });
    return () => { live = false; };
  }, [refreshKey]);

  const filters = useMemo(
    () => ({
      ...(view !== "ALL" ? { view } : {}),
      ...(shift !== "ALL" ? { shift } : {}),
      ...(facility !== "ALL" ? { facility } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [view, shift, facility, from, to],
  );

  function openCreate() {
    form.reset({
      vehicleId: "", tripId: "", driverId: "", facility: "", kind: "ARRIVAL",
      eventAt: nowLocal() as unknown as Date, note: "",
      trailerNumber: "", dockBay: "", activity: "OTHER", sealNumber: "", sealIntact: null,
      odometerKm: null, fuelLevel: "", source: "MANUAL",
    });
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
      <KpiRibbon<DockSummary>
        endpoint="/api/operational-kpi/dock-events/summary"
        filters={filters}
        refreshKey={refreshKey}
        tiles={(s) => [
          {
            label: "Average dwell time",
            value: dwell(s?.avgDwellHours ?? null),
            hint: s ? `across ${s.closedVisits} completed visit${s.closedVisits === 1 ? "" : "s"}` : "",
          },
          {
            label: "Active at docks",
            value: String(s?.activeAtDocks ?? 0),
            hint: "arrived, not yet departed",
          },
          {
            label: "Detention alerts",
            value: String(s?.detentionAlerts ?? 0),
            hint: `past the ${FREE_HOURS}h free period`,
            tone: (s?.detentionAlerts ?? 0) > 0 ? "danger" : "default",
          },
          {
            label: "On-time gate passes",
            value: s?.onTimeGatePassesPct == null ? "—" : `${s.onTimeGatePassesPct}%`,
            hint: "cleared within the free period",
            tone: s?.onTimeGatePassesPct != null && s.onTimeGatePassesPct < 80 ? "warn" : "default",
          },
        ]}
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">View</Label>
          <Select value={view} onValueChange={setView}>
            <SelectTrigger className="w-[168px]"><SelectValue /></SelectTrigger>
            <SelectContent>{VIEWS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Shift</Label>
          <Select value={shift} onValueChange={setShift}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{SHIFTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Facility</Label>
          <Select value={facility} onValueChange={setFacility}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All facilities</SelectItem>
              {facilities.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
        </div>
        {Object.keys(filters).length > 0 && (
          <Button
            variant="ghost"
            onClick={() => { setView("ALL"); setShift("ALL"); setFacility("ALL"); setFrom(""); setTo(""); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <DataTable<DockEventRow>
        endpoint="/api/operational-kpi/dock-events"
        columns={columns}
        filters={filters}
        searchPlaceholder="Search facility, trailer or note"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />Record Event</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
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
              <div className="space-y-1.5">
                <Label>Driver</Label>
                <Select value={form.watch("driverId") || "none"} onValueChange={(v) => form.setValue("driverId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Note</Label>
                <Input placeholder="Waiting for weighbridge" {...form.register("note")} />
              </div>
            </div>

            <FormSection title="Gate and yard">
              <div className="space-y-1.5">
                <Label>Activity</Label>
                <Select value={form.watch("activity")} onValueChange={(v) => form.setValue("activity", v as DockActivity)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DOCK_ACTIVITY_LABEL) as DockActivity[]).map((a) => (
                      <SelectItem key={a} value={a}>{DOCK_ACTIVITY_LABEL[a]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bay / Gate</Label>
                <Input placeholder="Bay 04 / Gate 2 (Inbound)" {...form.register("dockBay")} />
              </div>
              <div className="space-y-1.5">
                <Label>Trailer / Container No.</Label>
                <Input placeholder="T 456 DEF / MSKU 928374-1" {...form.register("trailerNumber")} />
              </div>
              <div className="space-y-1.5">
                <Label>Captured By</Label>
                <Select value={form.watch("source")} onValueChange={(v) => form.setValue("source", v as DockSource)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DOCK_SOURCE_LABEL) as DockSource[]).map((x) => (
                      <SelectItem key={x} value={x}>{DOCK_SOURCE_LABEL[x]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Seal Number</Label>
                <Input {...form.register("sealNumber")} />
              </div>
              <div className="space-y-1.5">
                <Label>Seal Condition</Label>
                <Select
                  value={form.watch("sealIntact") == null ? "unknown" : form.watch("sealIntact") ? "intact" : "broken"}
                  onValueChange={(v) => form.setValue("sealIntact", v === "unknown" ? null : v === "intact")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Not checked</SelectItem>
                    <SelectItem value="intact">Intact</SelectItem>
                    <SelectItem value="broken">Broken / replaced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Odometer (km)</Label>
                <Input type="number" {...form.register("odometerKm")} />
              </div>
              <div className="space-y-1.5">
                <Label>Fuel Level</Label>
                <Input placeholder="3/4 or 180 L" {...form.register("fuelLevel")} />
              </div>
            </FormSection>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
