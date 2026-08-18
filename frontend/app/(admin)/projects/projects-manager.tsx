"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { projectSchema, type ProjectInput } from "@frontend/lib/validations";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { ProjectStatus } from "@frontend/lib/enums";

type Client = { id: string; companyName: string };
type OrderOpt = { id: string; orderCode: string; projectId: string | null };

interface ProjectRow {
  id: string; projectCode: string; name: string; status: ProjectStatus; currency: string;
  budgetRevenue: string; budgetCost: string;
  client: { companyName: string } | null; _count: { orders: number };
}

interface Pnl {
  budgetRevenue: string; budgetCost: string; budgetProfit: string;
  actualRevenue: string; actualCost: string; actualProfit: string;
  marginPct: string; costVariance: string; revenueVariance: string;
}
interface ProjectDetail extends ProjectRow {
  manager: string | null;
  orders: { id: string; orderCode: string; status: string; freightAmount: string; currency: string }[];
  pnl: Pnl;
}

const STATUSES: ProjectStatus[] = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
// Manual transitions the UI offers (mirrors the backend guard; CANCELLED/COMPLETED terminal).
const NEXT: Record<ProjectStatus, ProjectStatus[]> = {
  PLANNING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
const money = (v: string, c: string) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function ProjectsManager({ clients, orders }: { clients: Client[]; orders: OrderOpt[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const refresh = () => setRefreshKey((k) => k + 1);
  const form = useForm<ProjectInput>({ resolver: zodResolver(projectSchema) });

  function openCreate() {
    form.reset({ name: "", clientId: "", manager: "", currency: "USD", budgetRevenue: 0, budgetCost: 0, startDate: null, endDate: null, description: "" });
    setCreateOpen(true);
  }

  async function onCreate(data: ProjectInput) {
    try {
      await apiFetch("/api/projects", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Project created", variant: "success" });
      setCreateOpen(false); refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<ProjectRow>[] = [
    { key: "projectCode", header: "Code", render: (r) => <span className="font-mono">{r.projectCode}</span> },
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "client", header: "Client", render: (r) => r.client?.companyName ?? "—" },
    { key: "orders", header: "Orders", render: (r) => <span className="tabular-nums">{r._count.orders}</span> },
    { key: "budgetRevenue", header: "Budget Rev.", render: (r) => <span className="tabular-nums">{money(r.budgetRevenue, r.currency)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={PROJECT_STATUS_VARIANT[r.status]}>{PROJECT_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<ProjectRow>
        endpoint="/api/projects"
        columns={columns}
        searchPlaceholder="Search code or name"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Project</Button>}
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>Open</Button>}
      />

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Name</Label>
                <Input placeholder="Q3 Copper Corridor Contract" {...form.register("name")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={form.watch("clientId") || "none"} onValueChange={(v) => form.setValue("clientId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Manager</Label><Input {...form.register("manager")} /></div>
              <div className="space-y-1.5"><Label>Budget Revenue</Label><Input type="number" step="0.01" {...form.register("budgetRevenue")} /></div>
              <div className="space-y-1.5"><Label>Budget Cost</Label><Input type="number" step="0.01" {...form.register("budgetCost")} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><CurrencySelect value={form.watch("currency")} onChange={(v) => form.setValue("currency", v)} /></div>
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" {...form.register("startDate")} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" {...form.register("endDate")} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Input {...form.register("description")} /></div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      {detailId && (
        <ProjectDetailDialog
          projectId={detailId}
          orders={orders}
          onClose={() => setDetailId(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function ProjectDetailDialog({ projectId, orders, onClose, onChanged }: {
  projectId: string; orders: OrderOpt[]; onClose: () => void; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [attachId, setAttachId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const d = await apiFetch<ProjectDetail>(`/api/projects/${projectId}`);
      setData(d);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to load", variant: "destructive" });
      onClose();
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  async function setStatus(status: ProjectStatus) {
    setBusy(true);
    try {
      await apiFetch(`/api/projects/${projectId}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast({ title: `Marked ${PROJECT_STATUS_LABEL[status]}`, variant: "success" });
      await load(); onChanged();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function attach(orderId: string, projId: string | null) {
    setBusy(true);
    try {
      await apiFetch(`/api/projects/${projectId}/orders`, { method: "POST", body: JSON.stringify({ orderId, projectId: projId }) });
      toast({ title: projId ? "Order attached" : "Order detached", variant: "success" });
      setAttachId(""); await load(); onChanged();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  // Orders not already on this project, available to attach.
  const linkedIds = new Set((data?.orders ?? []).map((o) => o.id));
  const attachable = orders.filter((o) => !linkedIds.has(o.id));
  const c = data?.currency ?? "USD";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {!data ? <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div> : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{data.projectCode}</span>
                {data.name}
                <Badge variant={PROJECT_STATUS_VARIANT[data.status]}>{PROJECT_STATUS_LABEL[data.status]}</Badge>
              </DialogTitle>
            </DialogHeader>

            {/* P&L: budget vs actual */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Actual Revenue" value={money(data.pnl.actualRevenue, c)} />
              <Metric label="Actual Cost" value={money(data.pnl.actualCost, c)} />
              <Metric label="Actual Profit" value={money(data.pnl.actualProfit, c)} tone={parseFloat(data.pnl.actualProfit) >= 0 ? "pos" : "neg"} />
              <Metric label="Margin" value={`${data.pnl.marginPct}%`} tone={parseFloat(data.pnl.marginPct) >= 0 ? "pos" : "neg"} />
              <Metric label="Budget Revenue" value={money(data.pnl.budgetRevenue, c)} muted />
              <Metric label="Budget Cost" value={money(data.pnl.budgetCost, c)} muted />
              <Metric label="Cost Variance" value={money(data.pnl.costVariance, c)} tone={parseFloat(data.pnl.costVariance) <= 0 ? "pos" : "neg"} />
              <Metric label="Revenue Variance" value={money(data.pnl.revenueVariance, c)} tone={parseFloat(data.pnl.revenueVariance) >= 0 ? "pos" : "neg"} />
            </div>

            {/* Status actions */}
            {NEXT[data.status].length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Move to:</span>
                {NEXT[data.status].map((s) => (
                  <Button key={s} variant="outline" size="sm" disabled={busy} onClick={() => setStatus(s)}>{PROJECT_STATUS_LABEL[s]}</Button>
                ))}
              </div>
            )}

            {/* Linked orders */}
            <div className="space-y-2">
              <Label>Linked Orders ({data.orders.length})</Label>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {data.orders.length === 0 && <p className="text-xs text-muted-foreground">No orders attached yet.</p>}
                {data.orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                    <span className="font-mono">{o.orderCode}</span>
                    <span className="tabular-nums text-muted-foreground">{money(o.freightAmount, o.currency)}</span>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => attach(o.id, null)}>Detach</Button>
                  </div>
                ))}
              </div>
              <div className="flex items-end gap-2 pt-1">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Attach an order</Label>
                  <Select value={attachId} onValueChange={setAttachId}>
                    <SelectTrigger><SelectValue placeholder="Select an order" /></SelectTrigger>
                    <SelectContent>
                      {attachable.length === 0 && <SelectItem value="none" disabled>No available orders</SelectItem>}
                      {attachable.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderCode}{o.projectId ? " (on another project)" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button disabled={busy || !attachId} onClick={() => attach(attachId, projectId)}>Attach</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, tone, muted }: { label: string; value: string; tone?: "pos" | "neg"; muted?: boolean }) {
  const color = tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-destructive" : muted ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
