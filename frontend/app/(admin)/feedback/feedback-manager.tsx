"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Star } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { feedbackSchema, type FeedbackInput } from "@frontend/lib/validations";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

type Customer = { id: string; name: string };
type Order = { id: string; orderCode: string };

interface FeedbackRow {
  id: string; csat: number | null; nps: number | null; comment: string | null; collectedAt: string;
  customer: { name: string }; order: { orderCode: string } | null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const today = () => new Date().toISOString().slice(0, 10);
// NPS band → badge tone: promoter 9–10, passive 7–8, detractor 0–6.
function npsVariant(n: number): "success" | "warning" | "destructive" {
  if (n >= 9) return "success";
  if (n >= 7) return "warning";
  return "destructive";
}

const columns: Column<FeedbackRow>[] = [
  { key: "collectedAt", header: "Date", render: (r) => <span className="text-xs">{day(r.collectedAt)}</span> },
  { key: "customer", header: "Customer", render: (r) => r.customer.name },
  { key: "order", header: "Order", render: (r) => r.order?.orderCode ?? "—" },
  {
    key: "csat", header: "CSAT",
    render: (r) => r.csat == null ? "—" : (
      <span className="inline-flex items-center gap-1 tabular-nums"><Star className="h-3.5 w-3.5 fill-current text-amber-500" />{r.csat}/5</span>
    ),
  },
  { key: "nps", header: "NPS", render: (r) => r.nps == null ? "—" : <Badge variant={npsVariant(r.nps)}>{r.nps}</Badge> },
  { key: "comment", header: "Comment", render: (r) => <span className="line-clamp-1 max-w-[16rem] text-xs text-muted-foreground">{r.comment || "—"}</span> },
];

export function FeedbackManager({ customers, orders }: { customers: Customer[]; orders: Order[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<FeedbackInput>({ resolver: zodResolver(feedbackSchema) });

  function openCreate() {
    form.reset({ customerId: "", orderId: "", csat: null, nps: null, comment: "", collectedAt: today() as unknown as Date });
    setOpen(true);
  }

  async function onSubmit(data: FeedbackInput) {
    try {
      await apiFetch("/api/operational-kpi/feedback", {
        method: "POST",
        body: JSON.stringify({ ...data, csat: data.csat || null, nps: data.nps ?? null }),
      });
      toast({ title: "Feedback recorded", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<FeedbackRow>
        endpoint="/api/operational-kpi/feedback"
        columns={columns}
        searchPlaceholder="Search comments"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />Record Feedback</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Customer Feedback</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={form.watch("customerId")} onValueChange={(v) => form.setValue("customerId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
                {form.formState.errors.customerId && <p className="text-xs text-destructive">{form.formState.errors.customerId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" {...form.register("collectedAt")} />
                {form.formState.errors.collectedAt && <p className="text-xs text-destructive">{form.formState.errors.collectedAt.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>CSAT (1–5)</Label>
                <Input type="number" min={1} max={5} placeholder="4" {...form.register("csat")} />
                {form.formState.errors.csat && <p className="text-xs text-destructive">{form.formState.errors.csat.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>NPS (0–10)</Label>
                <Input type="number" min={0} max={10} placeholder="9" {...form.register("nps")} />
                {form.formState.errors.nps && <p className="text-xs text-destructive">{form.formState.errors.nps.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Order (optional)</Label>
                <Select value={form.watch("orderId") || "none"} onValueChange={(v) => form.setValue("orderId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Link an order" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderCode}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Comment</Label>
                <Input placeholder="Driver was courteous, delivery on time" {...form.register("comment")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Provide at least a CSAT or an NPS score.</p>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
