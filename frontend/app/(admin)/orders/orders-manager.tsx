"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, FileText } from "lucide-react";
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
import { orderSchema, type OrderInput } from "@/lib/validations";
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT, CORRIDOR_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/fetcher";
import type { OrderStatus, CorridorType } from "@prisma/client";

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
        <DialogContent className="max-w-2xl">
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
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} {...form.register("currency")} /></div>
              <div className="space-y-1.5"><Label>Booking Date</Label><Input type="date" {...form.register("bookingDate", { valueAsDate: true })} /></div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
