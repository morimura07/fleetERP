"use client";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, RefreshCw } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { forecastSchema, type ForecastInput } from "@frontend/lib/validations";
import { FormSection } from "@frontend/components/ui/form-section";
import { EQUIPMENT_TYPE_LABEL } from "@frontend/lib/labels";
import type { EquipmentType } from "@frontend/lib/enums";
import { FORECAST_STATUS_LABEL, FORECAST_STATUS_VARIANT, CORRIDOR_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { ForecastStatus, CorridorType } from "@frontend/lib/enums";

const CORRIDORS: CorridorType[] = ["NORTHERN", "CENTRAL", "DOMESTIC"];
const STATUSES: ForecastStatus[] = ["DRAFT", "CONFIRMED", "ARCHIVED"];
// Manual transitions the UI offers (mirrors the backend guard).
const NEXT: Record<ForecastStatus, ForecastStatus[]> = {
  DRAFT: ["CONFIRMED"],
  CONFIRMED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: [],
};

interface ForecastRow {
  id: string; period: string; corridor: CorridorType; status: ForecastStatus;
  forecastLoads: number; forecastTonnes: string; plannedTrucks: number | null; notes: string | null;
}

interface CapacityLine {
  corridor: CorridorType; forecastLoads: number; forecastTonnes: string;
  capacityLoads: number; shortfall: number; surplus: number; utilizationPct: number;
}
interface CapacityPlan {
  period: string; lines: CapacityLine[];
  totalForecastLoads: number; totalCapacityLoads: number; totalShortfall: number; overallUtilizationPct: number;
}

interface PlanActualLine {
  corridor: CorridorType;
  forecastLoads: number; actualLoads: number; loadVariance: number; loadAchievedPct: number;
  forecastTonnes: string; actualTonnes: string; tonneVariance: string; tonneAchievedPct: number;
}
interface PlanVsActual {
  period: string; lines: PlanActualLine[];
  totalForecastLoads: number; totalActualLoads: number;
  totalForecastTonnes: string; totalActualTonnes: string;
  loadAchievedPct: number; tonneAchievedPct: number;
}

export function PlanningManager() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const form = useForm<ForecastInput>({ resolver: zodResolver(forecastSchema) });
  const refresh = () => setRefreshKey((k) => k + 1);

  function openCreate() {
    form.reset({
      period: "", corridor: "NORTHERN", forecastLoads: 0, forecastTonnes: 0,
      plannedTrucks: null, plannedDrivers: null, notes: "",
      contractName: "", cargoType: "", equipmentClass: null,
      originHub: "", destinationHub: "", turnaroundDays: null, projectedRevenue: null,
    });
    setOpen(true);
  }

  async function onCreate(data: ForecastInput) {
    try {
      await apiFetch("/api/planning/forecasts", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Forecast saved", variant: "success" });
      setOpen(false); refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function advance(id: string, status: ForecastStatus) {
    try {
      await apiFetch(`/api/planning/forecasts/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast({ title: `Marked ${FORECAST_STATUS_LABEL[status]}`, variant: "success" });
      refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<ForecastRow>[] = [
    { key: "period", header: "Period", render: (r) => <span className="font-mono">{r.period}</span> },
    { key: "corridor", header: "Corridor", render: (r) => CORRIDOR_LABEL[r.corridor] },
    { key: "forecastLoads", header: "Loads", render: (r) => <span className="tabular-nums">{r.forecastLoads}</span> },
    { key: "forecastTonnes", header: "Tonnes", render: (r) => <span className="tabular-nums">{parseFloat(r.forecastTonnes).toLocaleString()}</span> },
    { key: "plannedTrucks", header: "Planned Trucks", render: (r) => r.plannedTrucks ?? <span className="text-muted-foreground">live fleet</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={FORECAST_STATUS_VARIANT[r.status]}>{FORECAST_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <div className="space-y-8">
      <CapacityPanel refreshKey={refreshKey} />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Demand Forecasts</h2>
        <DataTable<ForecastRow>
          endpoint="/api/planning/forecasts"
          columns={columns}
          searchPlaceholder="Search period or notes"
          refreshKey={refreshKey}
          toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Forecast</Button>}
          rowActions={(r) => NEXT[r.status].length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
            <div className="flex gap-1.5">
              {NEXT[r.status].map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => advance(r.id, s)}>{FORECAST_STATUS_LABEL[s]}</Button>
              ))}
            </div>
          )}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Demand Forecast</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Period</Label>
                <Input placeholder="2026-08" {...form.register("period")} />
                {form.formState.errors.period && <p className="text-xs text-destructive">{form.formState.errors.period.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Corridor</Label>
                <Select value={form.watch("corridor")} onValueChange={(v) => form.setValue("corridor", v as CorridorType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CORRIDORS.map((cr) => <SelectItem key={cr} value={cr}>{CORRIDOR_LABEL[cr]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Forecast Loads</Label><Input type="number" min={0} {...form.register("forecastLoads")} /></div>
              <div className="space-y-1.5"><Label>Forecast Tonnes</Label><Input type="number" step="0.01" min={0} {...form.register("forecastTonnes")} /></div>
              <div className="space-y-1.5">
                <Label>Planned Trucks <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="number" min={0} placeholder="live fleet" {...form.register("plannedTrucks")} />
              </div>
              <div className="space-y-1.5">
                <Label>Planned Drivers <span className="text-muted-foreground">(optional)</span></Label>
                <Input type="number" min={0} {...form.register("plannedDrivers")} />
              </div>
              <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Input {...form.register("notes")} /></div>
            </div>

            <FormSection title="Demand detail">
              <div className="space-y-1.5">
                <Label>Customer / Contract</Label>
                <Input placeholder="TotalEnergies fuel haulage" {...form.register("contractName")} />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo Type</Label>
                <Input placeholder="Bulk fuel / containerised / break-bulk" {...form.register("cargoType")} />
              </div>
              <div className="space-y-1.5">
                <Label>Equipment Class</Label>
                <Select
                  value={form.watch("equipmentClass") ?? "none"}
                  onValueChange={(v) => form.setValue("equipmentClass", v === "none" ? null : (v as EquipmentType))}
                >
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Any —</SelectItem>
                    {(Object.keys(EQUIPMENT_TYPE_LABEL) as EquipmentType[]).map((e) => (
                      <SelectItem key={e} value={e}>{EQUIPMENT_TYPE_LABEL[e]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Turnaround (days per round trip)</Label>
                <Input type="number" step="0.5" min={0} {...form.register("turnaroundDays")} />
                <p className="text-xs text-muted-foreground">What converts a load count into a truck count.</p>
              </div>
              <div className="space-y-1.5"><Label>Origin Hub</Label><Input placeholder="Dar es Salaam" {...form.register("originHub")} /></div>
              <div className="space-y-1.5"><Label>Destination Hub</Label><Input placeholder="Lubumbashi" {...form.register("destinationHub")} /></div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Projected Revenue</Label>
                <Input type="number" step="0.01" min={0} {...form.register("projectedRevenue")} />
              </div>
            </FormSection>
            <p className="text-xs text-muted-foreground">One forecast per period + corridor. Confirmed forecasts feed the capacity plan above.</p>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function utilTone(pct: number): string {
  if (pct > 100) return "bg-destructive";
  if (pct >= 85) return "bg-amber-500";
  return "bg-emerald-500";
}

function CapacityPanel({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>("");
  const [plan, setPlan] = useState<CapacityPlan | null>(null);
  const [actual, setActual] = useState<PlanVsActual | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPeriods = useCallback(async () => {
    try {
      const ps = await apiFetch<string[]>("/api/planning/periods");
      setPeriods(ps);
      setPeriod((cur) => cur || ps[0] || "");
    } catch { /* first load may be empty */ }
  }, []);

  const loadPlan = useCallback(async (p: string) => {
    if (!p) { setPlan(null); setActual(null); return; }
    setLoading(true);
    try {
      // The plan and the result it is measured against always move together, so
      // one period selection drives both.
      const [capacity, results] = await Promise.all([
        apiFetch<CapacityPlan>(`/api/planning/capacity?period=${encodeURIComponent(p)}`),
        apiFetch<PlanVsActual>(`/api/planning/actuals?period=${encodeURIComponent(p)}`),
      ]);
      setPlan(capacity);
      setActual(results);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to load plan", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadPeriods(); }, [loadPeriods, refreshKey]);
  useEffect(() => { loadPlan(period); }, [period, refreshKey, loadPlan]);

  return (
    <div className="rounded-xl border border-border bg-card/50 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Capacity Plan <span className="font-normal text-muted-foreground">— confirmed demand vs available fleet</span></h2>
        <div className="flex items-center gap-2">
          <Select value={period || "none"} onValueChange={(v) => setPeriod(v === "none" ? "" : v)}>
            <SelectTrigger className="h-9 w-[10rem]"><SelectValue placeholder="Pick a period" /></SelectTrigger>
            <SelectContent>
              {periods.length === 0 && <SelectItem value="none" disabled>No periods yet</SelectItem>}
              {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => loadPlan(period)} disabled={!period || loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      {!plan || plan.lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {period ? "No confirmed forecasts for this period. Confirm a forecast below to build the plan." : "Create and confirm a forecast to see the capacity plan."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Forecast Loads" value={String(plan.totalForecastLoads)} />
            <Metric label="Fleet Capacity" value={String(plan.totalCapacityLoads)} />
            <Metric label="Shortfall" value={String(plan.totalShortfall)} tone={plan.totalShortfall > 0 ? "neg" : "pos"} />
            <Metric label="Utilization" value={`${plan.overallUtilizationPct}%`} tone={plan.overallUtilizationPct > 100 ? "neg" : "pos"} />
          </div>
          <div className="mt-4 space-y-3">
            {plan.lines.map((l) => (
              <div key={l.corridor} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{CORRIDOR_LABEL[l.corridor]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {l.forecastLoads} loads / {l.capacityLoads} trucks · {l.utilizationPct}%
                    {l.shortfall > 0 && <span className="ml-2 font-semibold text-destructive">short {l.shortfall}</span>}
                    {l.surplus > 0 && <span className="ml-2 text-emerald-500">spare {l.surplus}</span>}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${utilTone(l.utilizationPct)}`} style={{ width: `${Math.min(100, l.utilizationPct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {actual && actual.lines.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Forecast vs Actual <span className="font-normal text-muted-foreground">— what was planned against what moved</span>
          </h3>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Forecast Loads" value={String(actual.totalForecastLoads)} />
            <Metric label="Actual Loads" value={String(actual.totalActualLoads)} tone={achievedTone(actual.loadAchievedPct)} />
            <Metric label="Forecast Tonnes" value={Number(actual.totalForecastTonnes).toLocaleString()} />
            <Metric label="Actual Tonnes" value={Number(actual.totalActualTonnes).toLocaleString()} tone={achievedTone(actual.tonneAchievedPct)} />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-1.5 text-left font-medium">Corridor</th>
                  <th className="pb-1.5 text-right font-medium">Loads plan / actual</th>
                  <th className="pb-1.5 text-right font-medium">Var</th>
                  <th className="pb-1.5 text-right font-medium">Tonnes plan / actual</th>
                  <th className="pb-1.5 text-right font-medium">Var</th>
                </tr>
              </thead>
              <tbody>
                {actual.lines.map((l) => (
                  <tr key={l.corridor} className="border-b border-border/50 last:border-0">
                    <td className="py-2 font-medium">
                      {CORRIDOR_LABEL[l.corridor]}
                      {l.forecastLoads === 0 && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-500">unplanned</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {l.forecastLoads} / <span className="text-foreground">{l.actualLoads}</span>
                    </td>
                    <td className={`py-2 text-right tabular-nums font-medium ${varianceColor(l.loadVariance)}`}>
                      {signed(l.loadVariance)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {Number(l.forecastTonnes).toLocaleString()} / <span className="text-foreground">{Number(l.actualTonnes).toLocaleString()}</span>
                    </td>
                    <td className={`py-2 text-right tabular-nums font-medium ${varianceColor(Number(l.tonneVariance))}`}>
                      {signed(Number(l.tonneVariance))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Delivering under plan is the problem case; at or above it is not. */
function achievedTone(pct: number): "pos" | "neg" | undefined {
  if (pct === 0) return undefined; // nothing forecast, so nothing to judge
  return pct >= 100 ? "pos" : "neg";
}

function varianceColor(v: number): string {
  if (v > 0) return "text-emerald-500";
  if (v < 0) return "text-destructive";
  return "text-muted-foreground";
}

const signed = (v: number) => (v > 0 ? `+${v.toLocaleString()}` : v.toLocaleString());

function Metric({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
