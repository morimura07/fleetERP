"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { SHIPMENT_MODE_LABEL, SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_VARIANT, CLEARANCE_STATUS_LABEL } from "@frontend/lib/labels";
import type { ShipmentMode, ShipmentStatus, ClearanceStatus } from "@frontend/lib/enums";
import { ShipmentDetail } from "./shipment-detail";

interface Row {
  id: string; shipmentNumber: string; status: ShipmentStatus; mode: ShipmentMode; clearanceStatus: ClearanceStatus; containerNo: string | null; portOfDischarge: string | null; eta: string | null; ata: string | null;
  purchaseOrder: { poNumber: string; vendor: { legalName: string } }; _count: { documents: number };
}
interface PoOpt { id: string; poNumber: string; status: string; vendor: { legalName: string } }
interface VendorOpt { id: string; code: string; legalName: string }

export function ShipmentsManager({ vendors }: { vendors: VendorOpt[] }) {
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const columns: Column<Row>[] = [
    { key: "shipmentNumber", header: "Shipment", render: (r) => <span className="font-mono">{r.shipmentNumber}</span> },
    { key: "purchaseOrder", header: "Order", render: (r) => <span><span className="font-mono">{r.purchaseOrder.poNumber}</span> <span className="text-muted-foreground">{r.purchaseOrder.vendor.legalName}</span></span> },
    { key: "mode", header: "Mode", render: (r) => <span>{SHIPMENT_MODE_LABEL[r.mode]}{r.containerNo ? <span className="ml-1 font-mono text-xs text-muted-foreground">{r.containerNo}</span> : null}</span> },
    { key: "portOfDischarge", header: "To", render: (r) => r.portOfDischarge ?? "" },
    { key: "eta", header: "ETA / ATA", render: (r) => <span className="tabular-nums">{r.eta?.slice(0, 10) ?? "-"}{r.ata ? ` / ${r.ata.slice(0, 10)}` : ""}</span> },
    { key: "clearanceStatus", header: "Clearance", render: (r) => <span className="text-xs text-muted-foreground">{CLEARANCE_STATUS_LABEL[r.clearanceStatus]}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={SHIPMENT_STATUS_VARIANT[r.status]}>{SHIPMENT_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<Row>
        endpoint="/api/shipments"
        columns={columns}
        searchPlaceholder="Search by shipment, container, document or order"
        refreshKey={refresh}
        toolbar={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Plan shipment</Button>}
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setOpenId(r.id)}>Open</Button>}
      />
      {creating && <CreateShipmentDialog vendors={vendors} onClose={() => setCreating(false)} onSaved={(id) => { setRefresh((k) => k + 1); setOpenId(id); }} />}
      {openId && <ShipmentDetail id={openId} onClose={() => setOpenId(null)} onChange={() => setRefresh((k) => k + 1)} />}
    </>
  );
}

function CreateShipmentDialog({ vendors, onClose, onSaved }: { vendors: VendorOpt[]; onClose: () => void; onSaved: (id: string) => void }) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<PoOpt[]>([]);
  const [f, setF] = useState({ purchaseOrderId: "", mode: "SEA" as ShipmentMode, incoterm: "", carrier: "", vesselOrFlight: "", containerNo: "", transportDocNo: "", portOfLoading: "", portOfDischarge: "", etd: "", eta: "", clearingAgentId: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    Promise.all(["APPROVED", "ISSUED", "ACKNOWLEDGED", "IN_PRODUCTION", "DISPATCHED", "PARTIAL"].map((st) => apiFetch<PoOpt[]>(`/api/procurement?status=${st}&pageSize=100`)))
      .then((lists) => setOrders(lists.flat()))
      .catch((e) => toast({ title: "Error", description: describeError(e), variant: "destructive" }));
  }, [toast]);

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...f, clearingAgentId: f.clearingAgentId || null, etd: f.etd || null, eta: f.eta || null };
      const s = await apiFetch<{ id: string; shipmentNumber: string }>("/api/shipments", { method: "POST", body: JSON.stringify(body) });
      toast({ title: `${s.shipmentNumber} planned`, variant: "success" });
      onSaved(s.id); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Plan a shipment</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Purchase order</Label>
            <Select value={f.purchaseOrderId || undefined} onValueChange={(v) => set("purchaseOrderId", v)}>
              <SelectTrigger><SelectValue placeholder="Pick an issued order" /></SelectTrigger>
              <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.poNumber} · {o.vendor.legalName} ({o.status.toLowerCase().replace("_", " ")})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={f.mode} onValueChange={(v) => set("mode", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(SHIPMENT_MODE_LABEL) as ShipmentMode[]).map((m) => <SelectItem key={m} value={m}>{SHIPMENT_MODE_LABEL[m]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Incoterm</Label><Input value={f.incoterm} onChange={(e) => set("incoterm", e.target.value.toUpperCase())} placeholder="CIF, FOB, DAP" /></div>
          <div className="space-y-1.5"><Label>Carrier</Label><Input value={f.carrier} onChange={(e) => set("carrier", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Vessel / flight</Label><Input value={f.vesselOrFlight} onChange={(e) => set("vesselOrFlight", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Container no.</Label><Input value={f.containerNo} onChange={(e) => set("containerNo", e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label>BL / AWB no.</Label><Input value={f.transportDocNo} onChange={(e) => set("transportDocNo", e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Clearing agent</Label>
            <Select value={f.clearingAgentId || "none"} onValueChange={(v) => set("clearingAgentId", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">None yet</SelectItem>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.code} · {v.legalName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Port of loading</Label><Input value={f.portOfLoading} onChange={(e) => set("portOfLoading", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Port of discharge</Label><Input value={f.portOfDischarge} onChange={(e) => set("portOfDischarge", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>ETD</Label><Input type="date" value={f.etd} onChange={(e) => set("etd", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>ETA</Label><Input type="date" value={f.eta} onChange={(e) => set("eta", e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !f.purchaseOrderId}>Plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
