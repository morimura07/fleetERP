"use client";
import { useEffect, useState } from "react";
import { Plus, CheckCircle2, BookText, XCircle, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { SERVICE_STATUS_LABEL, SERVICE_STATUS_VARIANT, SERVICE_KIND_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { ServiceOrderStatus, ServiceKind } from "@frontend/lib/enums";

type Vehicle = { id: string; plateNumber: string; model: string };
type Vendor = { id: string; code: string; legalName: string };
type Part = { id: string; code: string; name: string; unit: string; quantityOnHand: string; avgCost: string };

interface OrderRow {
  id: string; orderNumber: string; kind: ServiceKind; status: ServiceOrderStatus;
  fault: string; totalCost: string; currency: string;
  vehicle: { plateNumber: string; model: string };
  vendor: { legalName: string } | null;
  _count: { parts: number; labor: number };
}

const money = (v: string, c = "USD") => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function ServiceManager({ vehicles, vendors, parts }: { vehicles: Vehicle[]; vendors: Vendor[]; parts: Part[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [vehicleId, setVehicleId] = useState("");
  const [kind, setKind] = useState<ServiceKind>("INTERNAL");
  const [vendorId, setVendorId] = useState("");
  const [odometerKm, setOdometerKm] = useState("");
  const [fault, setFault] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => setRefreshKey((k) => k + 1);
  function openCreate() {
    setVehicleId(""); setKind("INTERNAL"); setVendorId(""); setOdometerKm(""); setFault("");
    setCreateOpen(true);
  }

  async function submit() {
    setBusy(true);
    try {
      if (!vehicleId) throw new ApiError("Select a vehicle", 422);
      if (!fault.trim()) throw new ApiError("Describe the fault", 422);
      if (kind === "EXTERNAL" && !vendorId) throw new ApiError("Select a vendor for external work", 422);
      await apiFetch("/api/service-orders", {
        method: "POST",
        body: JSON.stringify({
          vehicleId, kind, vendorId: kind === "EXTERNAL" ? vendorId : null,
          odometerKm: odometerKm ? Number(odometerKm) : null, fault,
        }),
      });
      toast({ title: "Service order opened", variant: "success" });
      setCreateOpen(false); refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const columns: Column<OrderRow>[] = [
    { key: "orderNumber", header: "Order", render: (r) => <span className="font-mono">{r.orderNumber}</span> },
    { key: "vehicle", header: "Vehicle", render: (r) => <span>{r.vehicle.plateNumber} <span className="text-muted-foreground">· {r.vehicle.model}</span></span> },
    { key: "kind", header: "Kind", render: (r) => SERVICE_KIND_LABEL[r.kind] },
    { key: "fault", header: "Fault", render: (r) => <span className="line-clamp-1 max-w-[16rem]">{r.fault}</span> },
    { key: "totalCost", header: "Cost", render: (r) => <span className="tabular-nums">{money(r.totalCost, r.currency)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={SERVICE_STATUS_VARIANT[r.status]}>{SERVICE_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<OrderRow>
        endpoint="/api/service-orders"
        columns={columns}
        searchPlaceholder="Search by order no. or fault"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Order</Button>}
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>Open</Button>}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Service Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Vehicle</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plateNumber} — {v.model}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as ServiceKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SERVICE_KIND_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {kind === "EXTERNAL" && (
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Garage / vendor</Label>
                  <Select value={vendorId} onValueChange={setVendorId}>
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.code} — {v.legalName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Odometer (km)</Label>
                <Input type="number" value={odometerKm} onChange={(e) => setOdometerKm(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Fault / service reason</Label>
              <Input value={fault} onChange={(e) => setFault(e.target.value)} placeholder="Brake pads worn, front axle noise…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>Open order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailId && <OrderDetail id={detailId} parts={parts} onClose={() => setDetailId(null)} onChange={refresh} />}
    </>
  );
}

type OrderDetailData = {
  id: string; orderNumber: string; kind: ServiceKind; status: ServiceOrderStatus;
  fault: string; odometerKm: number | null; currency: string;
  partsCost: string; laborCost: string; totalCost: string;
  vehicle: { plateNumber: string; model: string; vehicleNumber: string };
  vendor: { legalName: string; code: string } | null;
  postingEntry: { voucherNumber: string } | null;
  parts: { id: string; description: string; quantity: string; unitCost: string; totalCost: string }[];
  labor: { id: string; description: string; hours: string; rate: string; amount: string }[];
};

function OrderDetail({ id, parts, onClose, onChange }: { id: string; parts: Part[]; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [busy, setBusy] = useState(false);

  // add-part form
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState("1");
  // add-labor form
  const [laborDesc, setLaborDesc] = useState("");
  const [hours, setHours] = useState("1");
  const [rate, setRate] = useState("0");

  async function load() {
    try { setOrder(await apiFetch<OrderDetailData>(`/api/service-orders/${id}`)); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function act(path: string, label: string, opts?: { method?: string; body?: unknown; reset?: () => void }) {
    setBusy(true);
    try {
      await apiFetch(`/api/service-orders/${id}${path}`, {
        method: opts?.method ?? "POST",
        body: opts?.body ? JSON.stringify(opts.body) : undefined,
      });
      toast({ title: label, variant: "success" });
      opts?.reset?.();
      onChange(); await load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const editable = order?.status === "OPEN" || order?.status === "IN_PROGRESS";
  const selectedPart = parts.find((p) => p.id === partId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{order ? `${order.orderNumber} — ${order.vehicle.plateNumber}` : "Loading…"}</DialogTitle></DialogHeader>
        {order && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={SERVICE_STATUS_VARIANT[order.status]}>{SERVICE_STATUS_LABEL[order.status]}</Badge>
              <span className="text-muted-foreground">{SERVICE_KIND_LABEL[order.kind]}{order.vendor ? ` · ${order.vendor.legalName}` : ""}</span>
              {order.odometerKm != null && <span className="text-muted-foreground">{order.odometerKm.toLocaleString()} km</span>}
              <span className="ml-auto font-semibold tabular-nums">{money(order.totalCost, order.currency)}</span>
            </div>
            <p className="text-sm text-muted-foreground">{order.fault}</p>

            {/* Parts */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Parts (issued from inventory)</div>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-elevated/50 text-[11px] uppercase text-muted-foreground">
                    <tr><th className="p-2 text-left">Part</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit</th><th className="p-2 text-right">Total</th></tr>
                  </thead>
                  <tbody>
                    {order.parts.length === 0 && <tr><td colSpan={4} className="p-2 text-center text-muted-foreground">No parts issued.</td></tr>}
                    {order.parts.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">{p.description}</td>
                        <td className="p-2 text-right tabular-nums">{parseFloat(p.quantity).toString()}</td>
                        <td className="p-2 text-right tabular-nums">{parseFloat(p.unitCost).toFixed(2)}</td>
                        <td className="p-2 text-right tabular-nums">{money(p.totalCost, order.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editable && (
                <div className="mt-2 flex gap-2">
                  <Select value={partId} onValueChange={setPartId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select part" /></SelectTrigger>
                    <SelectContent>
                      {parts.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name} ({parseFloat(p.quantityOnHand)} {p.unit})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="w-24" type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
                  <Button variant="outline" disabled={busy || !partId || !(Number(qty) > 0)}
                    onClick={() => act("/parts", "Part issued", { body: { stockItemId: partId, quantity: Number(qty) }, reset: () => { setPartId(""); setQty("1"); } })}>
                    <Plus className="h-4 w-4" />Issue
                  </Button>
                </div>
              )}
              {editable && selectedPart && (
                <p className="mt-1 text-xs text-muted-foreground">≈ {money(String((Number(qty) || 0) * Number(selectedPart.avgCost)), order.currency)} at current average cost</p>
              )}
            </div>

            {/* Labor */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Labor</div>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-elevated/50 text-[11px] uppercase text-muted-foreground">
                    <tr><th className="p-2 text-left">Description</th><th className="p-2 text-right">Hours</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th><th className="p-2"></th></tr>
                  </thead>
                  <tbody>
                    {order.labor.length === 0 && <tr><td colSpan={5} className="p-2 text-center text-muted-foreground">No labor lines.</td></tr>}
                    {order.labor.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="p-2">{l.description}</td>
                        <td className="p-2 text-right tabular-nums">{parseFloat(l.hours).toString()}</td>
                        <td className="p-2 text-right tabular-nums">{parseFloat(l.rate).toFixed(2)}</td>
                        <td className="p-2 text-right tabular-nums">{money(l.amount, order.currency)}</td>
                        <td className="p-2 text-right">
                          {editable && (
                            <button className="text-muted-foreground hover:text-destructive" onClick={() => act(`/labor/${l.id}`, "Labor removed", { method: "DELETE" })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editable && (
                <div className="mt-2 flex gap-2">
                  <Input className="flex-1" value={laborDesc} onChange={(e) => setLaborDesc(e.target.value)} placeholder="e.g. Brake replacement labor" />
                  <Input className="w-20" type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hrs" />
                  <Input className="w-24" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Rate" />
                  <Button variant="outline" disabled={busy || !laborDesc.trim() || !(Number(hours) > 0)}
                    onClick={() => act("/labor", "Labor added", { body: { description: laborDesc, hours: Number(hours), rate: Number(rate) }, reset: () => { setLaborDesc(""); setHours("1"); setRate("0"); } })}>
                    <Plus className="h-4 w-4" />Add
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Parts {money(order.partsCost, order.currency)} · Labor {money(order.laborCost, order.currency)}</span>
              <span className="font-semibold text-foreground">Total {money(order.totalCost, order.currency)}</span>
            </div>

            {order.status === "POSTED" && order.postingEntry && (
              <p className="text-sm text-muted-foreground">Labor posted · voucher <span className="font-mono text-xs">{order.postingEntry.voucherNumber}</span></p>
            )}
            {order.status === "POSTED" && order.kind === "INTERNAL" && (
              <p className="text-sm text-muted-foreground">Own-workshop labor is a memo cost (mechanics are paid via Payroll); no separate ledger entry.</p>
            )}

            <DialogFooter className="gap-2">
              {editable && (
                <Button variant="outline" disabled={busy} onClick={() => act("/complete", "Marked complete")}>
                  <CheckCircle2 className="h-4 w-4" />Complete
                </Button>
              )}
              {editable && order.parts.length === 0 && (
                <Button variant="outline" disabled={busy} onClick={() => act("/cancel", "Order cancelled")}>
                  <XCircle className="h-4 w-4" />Cancel order
                </Button>
              )}
              {order.status === "COMPLETED" && (
                <Button disabled={busy} onClick={() => act("/post", "Order posted")}>
                  <BookText className="h-4 w-4" />Post{order.kind === "EXTERNAL" ? " labor" : ""}
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
