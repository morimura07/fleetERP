"use client";
import { useState } from "react";
import { Plus, BarChart3 } from "lucide-react";
import { DataTable, type Column } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  TRIP_STATUS_LABEL, TRIP_STATUS_VARIANT, CORRIDOR_LABEL, TRIP_EXPENSE_LABEL,
} from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/fetcher";
import type { TripStatus, CorridorType, TripExpenseType } from "@prisma/client";

interface OrderOpt { id: string; orderCode: string; originZone: string; destinationZone: string; corridor: CorridorType; }
interface DriverOpt { id: string; name: string; }
interface VehicleOpt { id: string; vehicleNumber: string; plateNumber: string; }
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
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mileage, setMileage] = useState("0");

  // detail dialog
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [expType, setExpType] = useState<TripExpenseType>("FUEL");
  const [expAmount, setExpAmount] = useState("");
  const [expPost, setExpPost] = useState(true);

  function openCreate() {
    setOrderId(""); setDriverId(""); setVehicleId(""); setStart(""); setEnd(""); setMileage("0");
    setOpen(true);
  }

  async function createTrip() {
    if (!orderId || !driverId || !vehicleId || !start || !end) {
      toast({ title: "Please fill in all fields", variant: "destructive" }); return;
    }
    const order = orders.find((o) => o.id === orderId);
    try {
      await apiFetch("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          orderId, driverId, vehicleId,
          corridor: order?.corridor ?? "DOMESTIC",
          mileageKm: mileage || "0",
          scheduledStart: new Date(start).toISOString(),
          scheduledEnd: new Date(end).toISOString(),
        }),
      });
      toast({ title: "Trip saved", variant: "success" });
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
        <DialogContent className="max-w-2xl">
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
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Driver</Label>
                <Select value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vehicle</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicleNumber} ({v.plateNumber})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Start</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>End</Label><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Distance (km)</Label><Input inputMode="decimal" value={mileage} onChange={(e) => setMileage(e.target.value)} /></div>
            </div>
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
