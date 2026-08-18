"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, FileText } from "lucide-react";
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
import { orderSchema, type OrderInput } from "@frontend/lib/validations";
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT, CORRIDOR_LABEL, EQUIPMENT_TYPE_LABEL, PAYMENT_TERM_LABEL, INCOTERMS_OPTIONS } from "@frontend/lib/labels";
import { OptionSelect } from "@frontend/components/ui/option-select";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
import { formatDate } from "@frontend/lib/utils";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { OrderStatus, CorridorType, EquipmentType, PaymentTerm } from "@frontend/lib/enums";

interface Client { id: string; companyName: string; }
interface Order {
  id: string;
  orderCode: string;
  client: { companyName: string };
  originZone: string;
  destinationZone: string;
  corridor: CorridorType;
  freightAmount: string;
  demurrageAmount: string;
  currency: string;
  status: OrderStatus;
  bookingDate: string;
}

const CORRIDORS = Object.keys(CORRIDOR_LABEL) as CorridorType[];
const EQUIPMENT = Object.keys(EQUIPMENT_TYPE_LABEL) as EquipmentType[];
const ORDER_TERMS = Object.keys(PAYMENT_TERM_LABEL) as PaymentTerm[];

export function OrdersManager({ clients }: { clients: Client[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const form = useForm<OrderInput>({ resolver: zodResolver(orderSchema) });

  function openCreate() {
    form.reset({
      dataAreaId: "HQ01", clientId: "", originZone: "", destinationZone: "",
      corridor: "DOMESTIC", cargoDescription: "", grossWeightKg: "0", volumeCbm: "0",
      freightAmount: "", demurrageAmount: "0", currency: "USD",
      bookingDate: new Date(), status: "DRAFT",
      paymentTerm: "NET_30", equipmentType: "OTHER", hazmat: false,
      accessorialCharges: "0", taxAmount: "0",
    });
    setOpen(true);
  }

  async function onSubmit(data: OrderInput) {
    try {
      await apiFetch("/api/orders", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Order saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function invoice(o: Order) {
    if (!confirm(`Invoice order ${o.orderCode}? Accounts receivable will be posted.`)) return;
    try {
      await apiFetch(`/api/orders/${o.id}`, { method: "POST", body: JSON.stringify({ action: "invoice" }) });
      toast({ title: "Invoice posted", variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to invoice", variant: "destructive" });
    }
  }

  const columns: Column<Order>[] = [
    { key: "orderCode", header: "Order" },
    { key: "client", header: "Client", render: (r) => r.client?.companyName ?? "" },
    { key: "route", header: "Route", render: (r) => `${r.originZone} → ${r.destinationZone}` },
    { key: "corridor", header: "Corridor", render: (r) => CORRIDOR_LABEL[r.corridor] },
    { key: "freightAmount", header: "Freight", render: (r) => `${r.currency} ${parseFloat(r.freightAmount).toLocaleString()}` },
    { key: "bookingDate", header: "Booked", render: (r) => formatDate(r.bookingDate) },
    { key: "status", header: "Status", render: (r) => <Badge variant={ORDER_STATUS_VARIANT[r.status]}>{ORDER_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<Order>
        endpoint="/api/orders"
        columns={columns}
        searchPlaceholder="Search by order or route"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Order</Button>}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {row.status !== "INVOICED" && row.status !== "CANCELLED" && (
              <Button variant="outline" size="sm" onClick={() => invoice(row)}><FileText className="h-4 w-4" />Invoice</Button>
            )}
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New Order</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={form.watch("clientId")} onValueChange={(v) => form.setValue("clientId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
                </Select>
                {form.formState.errors.clientId && <p className="text-xs text-destructive">Client is required</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Corridor</Label>
                <Select value={form.watch("corridor")} onValueChange={(v) => form.setValue("corridor", v as CorridorType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CORRIDORS.map((c) => <SelectItem key={c} value={c}>{CORRIDOR_LABEL[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Origin</Label><Input {...form.register("originZone")} /></div>
              <div className="space-y-1.5"><Label>Destination</Label><Input {...form.register("destinationZone")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Cargo</Label><Input {...form.register("cargoDescription")} /></div>
              <div className="space-y-1.5"><Label>Freight Amount</Label><Input inputMode="decimal" {...form.register("freightAmount")} />
                {form.formState.errors.freightAmount && <p className="text-xs text-destructive">{form.formState.errors.freightAmount.message}</p>}
              </div>
              <div className="space-y-1.5"><Label>Demurrage</Label><Input inputMode="decimal" {...form.register("demurrageAmount")} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><CurrencySelect value={form.watch("currency")} onChange={(v) => form.setValue("currency", v)} /></div>
              <div className="space-y-1.5"><Label>Booking Date</Label><Input type="date" {...form.register("bookingDate", { valueAsDate: true })} /></div>
            </div>

            <FormSection title="Parties">
              <div className="space-y-1.5"><Label>Shipper / Consignor</Label><Input {...form.register("shipper")} /></div>
              <div className="space-y-1.5"><Label>Consignee</Label><Input {...form.register("consignee")} /></div>
              <div className="space-y-1.5"><Label>Bill-To Party</Label><Input {...form.register("billTo")} /></div>
              <div className="space-y-1.5"><Label>Notify Party</Label><Input {...form.register("notifyParty")} /></div>
            </FormSection>

            <FormSection title="Organizational & Terms">
              <div className="space-y-1.5"><Label>Branch / Division</Label><Input {...form.register("branch")} /></div>
              <div className="space-y-1.5"><Label>Salesperson</Label><Input {...form.register("salesperson")} /></div>
              <div className="space-y-1.5"><Label>Incoterms</Label><OptionSelect value={form.watch("incoterms")} onChange={(v) => form.setValue("incoterms", v)} options={INCOTERMS_OPTIONS} placeholder="FOB / CIF…" /></div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Select value={form.watch("paymentTerm")} onValueChange={(v) => form.setValue("paymentTerm", v as PaymentTerm)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ORDER_TERMS.map((t) => <SelectItem key={t} value={t}>{PAYMENT_TERM_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </FormSection>

            <FormSection title="Routing">
              <div className="space-y-1.5 md:col-span-2"><Label>Pickup Address</Label><Input {...form.register("pickupAddress")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Delivery Address</Label><Input {...form.register("deliveryAddress")} /></div>
              <div className="space-y-1.5"><Label>Port of Loading (POL)</Label><Input {...form.register("pol")} /></div>
              <div className="space-y-1.5"><Label>Port of Delivery (POD)</Label><Input {...form.register("pod")} /></div>
              <div className="space-y-1.5"><Label>ETD</Label><Input type="datetime-local" {...form.register("etd")} /></div>
              <div className="space-y-1.5"><Label>ETA</Label><Input type="datetime-local" {...form.register("eta")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Routing Instructions</Label><Input {...form.register("routingNotes")} /></div>
            </FormSection>

            <FormSection title="Cargo & Equipment">
              <div className="space-y-1.5">
                <Label>Equipment Type</Label>
                <Select value={form.watch("equipmentType")} onValueChange={(v) => form.setValue("equipmentType", v as EquipmentType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EQUIPMENT.map((e) => <SelectItem key={e} value={e}>{EQUIPMENT_TYPE_LABEL[e]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Gross Weight (kg)</Label><Input inputMode="decimal" {...form.register("grossWeightKg")} /></div>
              <div className="space-y-1.5"><Label>Volume (CBM)</Label><Input inputMode="decimal" {...form.register("volumeCbm")} /></div>
              <div className="space-y-1.5"><Label>Piece Count</Label><Input type="number" {...form.register("pieceCount")} /></div>
              <div className="space-y-1.5"><Label>Dimensions (L×W×H)</Label><Input {...form.register("dimensions")} /></div>
              <div className="space-y-1.5"><Label>HAZMAT UN / Class</Label><Input {...form.register("hazmatUnCode")} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...form.register("hazmat")} /> Hazardous materials (HAZMAT)
              </label>
            </FormSection>

            <FormSection title="Financial & Documentation">
              <div className="space-y-1.5"><Label>Freight Rate (per unit)</Label><Input inputMode="decimal" {...form.register("freightRate")} /></div>
              <div className="space-y-1.5"><Label>Accessorial Charges</Label><Input inputMode="decimal" {...form.register("accessorialCharges")} /></div>
              <div className="space-y-1.5"><Label>Tax Amount</Label><Input inputMode="decimal" {...form.register("taxAmount")} /></div>
              <div className="space-y-1.5"><Label>Customer PO No.</Label><Input {...form.register("customerPo")} /></div>
              <div className="space-y-1.5"><Label>Master/House B/L or AWB</Label><Input {...form.register("blNumber")} /></div>
              <div className="space-y-1.5"><Label>HS Code</Label><Input {...form.register("hsCode")} /></div>
              <div className="space-y-1.5"><Label>Seal Number</Label><Input {...form.register("sealNumber")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Special Instructions</Label><Input {...form.register("specialInstructions")} /></div>
            </FormSection>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
