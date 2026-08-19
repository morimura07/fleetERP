"use client";
import { useState } from "react";
import { Plus, BarChart3, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@frontend/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@frontend/components/ui/select";
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import {
  TRIP_STATUS_LABEL, TRIP_STATUS_VARIANT, CORRIDOR_LABEL, TRIP_EXPENSE_LABEL,
} from "@frontend/lib/labels";
import { formatDate } from "@frontend/lib/utils";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { TripStatus, CorridorType, TripExpenseType } from "@frontend/lib/enums";

interface OrderOpt { id: string; orderCode: string; originZone: string; destinationZone: string; corridor: CorridorType; }
interface DriverOpt { id: string; name: string; }
interface VehicleOpt { id: string; vehicleNumber: string; plateNumber: string; defaultDriverId?: string | null; }

/** One truck on the order. A consignment is dispatched across as many as it needs. */
interface Leg { driverId: string; vehicleId: string; start: string; end: string; mileage: string; }
const emptyLeg = (): Leg => ({ driverId: "", vehicleId: "", start: "", end: "", mileage: "0" });
interface Trip {
  id: string;
  tripCode: string;
  order: { orderCode: string; originZone: string; destinationZone: string };
  driver: { name: string };
  vehicle: { vehicleNumber: string };
  corridor: CorridorType;
  scheduledStart: string;
  status: TripStatus;
}
interface TripExpense { id: string; type: TripExpenseType; amount: string; currency: string; note?: string | null; entryId?: string | null; }
interface TripDetail extends Trip {
  expenses: TripExpense[];
  pnl: { revenue: string; expenses: string; profit: string; marginPct: string; currency: string };
}

const EXPENSE_TYPES = Object.keys(TRIP_EXPENSE_LABEL) as TripExpenseType[];

export function TripsManager({ orders, drivers, vehicles }: { orders: OrderOpt[]; drivers: DriverOpt[]; vehicles: VehicleOpt[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  // create dialog
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [legs, setLegs] = useState<Leg[]>([emptyLeg()]);

  const setLeg = (i: number, patch: Partial<Leg>) =>
    setLegs((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const addLeg = () => setLegs((ls) => [...ls, { ...emptyLeg(), start: ls[ls.length - 1]?.start ?? "", end: ls[ls.length - 1]?.end ?? "" }]);
  const removeLeg = (i: number) => setLegs((ls) => (ls.length === 1 ? ls : ls.filter((_, n) => n !== i)));

  /** Picking a truck fills in the driver normally paired with it (client review:
   *  "the driver is mostly assigned, operations just review it"). */
  function chooseVehicle(i: number, vehicleId: string) {
    const v = vehicles.find((x) => x.id === vehicleId);
    setLeg(i, { vehicleId, ...(v?.defaultDriverId && !legs[i].driverId ? { driverId: v.defaultDriverId } : {}) });
  }
  // Extra spec fields (kept in one object to keep the form manageable).
  const emptyExtra = {
    trailerId: "", secondDriverId: "", originFacility: "", destinationFacility: "",
    viaPoints: "", plannedDistanceKm: "", routeCode: "", waybillNumber: "",
    cargoWeightKg: "", packageCount: "", specialHandling: "",
    advancePayment: "0", driverWages: "0", tollPermitCost: "0", miscExpense: "0",
    fuelType: "", fuelCardNumber: "", refuelStations: "", ewayBillRef: "", sealNumbers: "", incidentNotes: "",
  };
  const [extra, setExtra] = useState({ ...emptyExtra });
  const setX = (patch: Partial<typeof emptyExtra>) => setExtra((e) => ({ ...e, ...patch }));

  // detail dialog
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [expType, setExpType] = useState<TripExpenseType>("FUEL");
  const [expAmount, setExpAmount] = useState("");
  const [expPost, setExpPost] = useState(true);

  function openCreate() {
    setOrderId(""); setLegs([emptyLeg()]);
    setExtra({ ...emptyExtra });
    setOpen(true);
  }

  // Build the extra-fields payload: drop empties, coerce numerics.
  function extraPayload() {
    const numeric = new Set(["plannedDistanceKm", "cargoWeightKg", "packageCount", "advancePayment", "driverWages", "tollPermitCost", "miscExpense"]);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(extra)) {
      if (v === "" || v == null) continue;
      out[k] = numeric.has(k) ? Number(v) : v;
    }
    return out;
  }

  async function createTrip() {
    if (!orderId) { toast({ title: "Select an order", variant: "destructive" }); return; }
    const incomplete = legs.findIndex((l) => !l.driverId || !l.vehicleId || !l.start || !l.end);
    if (incomplete >= 0) {
      toast({ title: `Vehicle ${incomplete + 1} is incomplete`, description: "Each row needs a vehicle, driver and both dates.", variant: "destructive" });
      return;
    }
    const order = orders.find((o) => o.id === orderId);
    const corridor = order?.corridor ?? "DOMESTIC";

    try {
      if (legs.length === 1) {
        // A single truck keeps the detailed form, extras and all.
        const l = legs[0];
        await apiFetch("/api/trips", {
          method: "POST",
          body: JSON.stringify({
            orderId, driverId: l.driverId, vehicleId: l.vehicleId, corridor,
            mileageKm: l.mileage || "0",
            scheduledStart: new Date(l.start).toISOString(),
            scheduledEnd: new Date(l.end).toISOString(),
            ...extraPayload(),
          }),
        });
      } else {
        // A convoy is created in one transaction so a clash on the last row
        // does not leave the earlier ones behind.
        await apiFetch("/api/trips/batch", {
          method: "POST",
          body: JSON.stringify({
            orderId, corridor,
            legs: legs.map((l) => ({
              driverId: l.driverId, vehicleId: l.vehicleId,
              mileageKm: l.mileage || "0",
              scheduledStart: new Date(l.start).toISOString(),
              scheduledEnd: new Date(l.end).toISOString(),
            })),
          }),
        });
      }
      toast({ title: legs.length === 1 ? "Trip saved" : `${legs.length} trips assigned`, variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function openDetail(t: Trip) {
    try {
      const data = await apiFetch<TripDetail>(`/api/trips/${t.id}`);
      setDetail(data);
      setExpType("FUEL"); setExpAmount(""); setExpPost(true);
    } catch (e) {
      toast({ title: "Failed to load", description: e instanceof ApiError ? e.message : "", variant: "destructive" });
    }
  }

  async function addExpense() {
    if (!detail || !expAmount) { toast({ title: "Enter an amount", variant: "destructive" }); return; }
    try {
      await apiFetch(`/api/trips/${detail.id}/expenses`, {
        method: "POST",
        body: JSON.stringify({ type: expType, amount: expAmount, currency: detail.pnl.currency, post: expPost }),
      });
      toast({ title: "Expense saved", variant: "success" });
      await openDetail(detail); // refresh detail (recomputes P&L)
      setExpAmount("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  const columns: Column<Trip>[] = [
    { key: "tripCode", header: "Trip" },
    { key: "order", header: "Order", render: (r) => r.order?.orderCode ?? "" },
    { key: "route", header: "Route", render: (r) => `${r.order?.originZone} → ${r.order?.destinationZone}` },
    { key: "driver", header: "Driver", render: (r) => r.driver?.name ?? "" },
    { key: "vehicle", header: "Vehicle", render: (r) => r.vehicle?.vehicleNumber ?? "" },
    { key: "start", header: "Start", render: (r) => formatDate(r.scheduledStart, true) },
    { key: "status", header: "Status", render: (r) => <Badge variant={TRIP_STATUS_VARIANT[r.status]}>{TRIP_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<Trip>
        endpoint="/api/trips"
        columns={columns}
        searchPlaceholder="Search by trip code"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Trip</Button>}
        rowActions={(row) => (
          <Button variant="ghost" size="sm" onClick={() => openDetail(row)}><BarChart3 className="h-4 w-4" />P&amp;L</Button>
        )}
      />

      {/* Create trip */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New Trip</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Order (awaiting dispatch)</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {orders.length === 0 && <SelectItem value="none" disabled>No orders awaiting dispatch</SelectItem>}
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderCode} / {o.originZone}→{o.destinationZone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Vehicles on this order</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLeg}>
                  <Plus className="h-3.5 w-3.5" />Add vehicle
                </Button>
              </div>

              {legs.map((l, i) => (
                <div key={i} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Vehicle {i + 1}</span>
                    {legs.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeLeg(i)}>
                        <Trash2 className="h-3.5 w-3.5" />Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Vehicle</Label>
                      <Select value={l.vehicleId} onValueChange={(v) => chooseVehicle(i, v)}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicleNumber} ({v.plateNumber})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Driver</Label>
                      <Select value={l.driverId} onValueChange={(v) => setLeg(i, { driverId: v })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label>Start</Label><Input type="datetime-local" value={l.start} onChange={(e) => setLeg(i, { start: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>End</Label><Input type="datetime-local" value={l.end} onChange={(e) => setLeg(i, { end: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Distance (km)</Label><Input inputMode="decimal" value={l.mileage} onChange={(e) => setLeg(i, { mileage: e.target.value })} /></div>
                  </div>
                </div>
              ))}

              {legs.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  {legs.length} trips will be created against the same order. The detail fields below apply to a single
                  vehicle only — add the rest per trip afterwards.
                </p>
              )}
            </div>

            {legs.length === 1 && (<>
            <FormSection title="Vehicle & Crew">
              <div className="space-y-1.5"><Label>Trailer / Container ID</Label><Input value={extra.trailerId} onChange={(e) => setX({ trailerId: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Second Driver</Label>
                <Select value={extra.secondDriverId || undefined} onValueChange={(v) => setX({ secondDriverId: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Route Code</Label><Input value={extra.routeCode} onChange={(e) => setX({ routeCode: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Planned Distance (km)</Label><Input inputMode="decimal" value={extra.plannedDistanceKm} onChange={(e) => setX({ plannedDistanceKm: e.target.value })} /></div>
            </FormSection>

            <FormSection title="Route & Freight">
              <div className="space-y-1.5"><Label>Origin Facility</Label><Input value={extra.originFacility} onChange={(e) => setX({ originFacility: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Destination Facility</Label><Input value={extra.destinationFacility} onChange={(e) => setX({ destinationFacility: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Via Points / Checkpoints</Label><Input value={extra.viaPoints} onChange={(e) => setX({ viaPoints: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Waybill / Consignment No.</Label><Input value={extra.waybillNumber} onChange={(e) => setX({ waybillNumber: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Cargo Weight (kg)</Label><Input inputMode="decimal" value={extra.cargoWeightKg} onChange={(e) => setX({ cargoWeightKg: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Package Count</Label><Input type="number" value={extra.packageCount} onChange={(e) => setX({ packageCount: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Special Handling</Label><Input placeholder="Hazmat / Reefer / Oversized" value={extra.specialHandling} onChange={(e) => setX({ specialHandling: e.target.value })} /></div>
            </FormSection>

            <FormSection title="Financials & Fuel">
              <div className="space-y-1.5"><Label>Advance Payment</Label><Input inputMode="decimal" value={extra.advancePayment} onChange={(e) => setX({ advancePayment: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Driver Wages</Label><Input inputMode="decimal" value={extra.driverWages} onChange={(e) => setX({ driverWages: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Toll / Permit Cost</Label><Input inputMode="decimal" value={extra.tollPermitCost} onChange={(e) => setX({ tollPermitCost: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Misc. Expense</Label><Input inputMode="decimal" value={extra.miscExpense} onChange={(e) => setX({ miscExpense: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Fuel Type</Label><Input placeholder="Diesel" value={extra.fuelType} onChange={(e) => setX({ fuelType: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Fuel Card No.</Label><Input value={extra.fuelCardNumber} onChange={(e) => setX({ fuelCardNumber: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Planned Refuel Stations</Label><Input value={extra.refuelStations} onChange={(e) => setX({ refuelStations: e.target.value })} /></div>
            </FormSection>

            <FormSection title="Compliance & Safety">
              <div className="space-y-1.5"><Label>E-Way Bill / Customs Ref</Label><Input value={extra.ewayBillRef} onChange={(e) => setX({ ewayBillRef: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Seal Numbers</Label><Input value={extra.sealNumbers} onChange={(e) => setX({ sealNumbers: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Incident Notes</Label><Input placeholder="Breakdowns / accidents / delays" value={extra.incidentNotes} onChange={(e) => setX({ incidentNotes: e.target.value })} /></div>
            </FormSection>
            </>)}
          </div>
          <DialogFooter><Button onClick={createTrip}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trip detail + P&L */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detail?.tripCode} — Trip P&amp;L</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Revenue</div><div className="font-semibold">{parseFloat(detail.pnl.revenue).toLocaleString()}</div></div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Expenses</div><div className="font-semibold">{parseFloat(detail.pnl.expenses).toLocaleString()}</div></div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Profit</div><div className={`font-semibold ${parseFloat(detail.pnl.profit) < 0 ? "text-destructive" : "text-emerald-600"}`}>{parseFloat(detail.pnl.profit).toLocaleString()}</div></div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Margin</div><div className="font-semibold">{detail.pnl.marginPct}%</div></div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Expenses</Label>
                {detail.expenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expenses yet</p>
                ) : (
                  <div className="rounded-md border text-sm">
                    {detail.expenses.map((e) => (
                      <div key={e.id} className="flex items-center justify-between border-b px-3 py-1.5 last:border-0">
                        <span>{TRIP_EXPENSE_LABEL[e.type]}{e.note ? ` (${e.note})` : ""}</span>
                        <span className="flex items-center gap-2">
                          {e.currency} {parseFloat(e.amount).toLocaleString()}
                          {e.entryId ? <Badge variant="success">Posted</Badge> : <Badge variant="secondary">Unposted</Badge>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-[1fr,8rem,auto] items-end gap-2 rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select value={expType} onValueChange={(v) => setExpType(v as TripExpenseType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EXPENSE_TYPES.map((t) => <SelectItem key={t} value={t}>{TRIP_EXPENSE_LABEL[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Amount</Label><Input inputMode="decimal" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} /></div>
                <Button onClick={addExpense}>Add</Button>
                <label className="col-span-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={expPost} onChange={(e) => setExpPost(e.target.checked)} />
                  Post to ledger (Dr expense / Cr accounts payable)
                </label>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
