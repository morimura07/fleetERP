"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Label } from "@frontend/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@frontend/components/ui/table";
import { Loader } from "@frontend/components/ui/loader";
import { ExportMenu } from "@frontend/components/data/export-menu";
import { apiFetch } from "@frontend/lib/fetcher";

interface FleetLine {
  corridor: string;
  equipmentClass: string | null;
  forecastLoads: number;
  forecastTonnes: string;
  turnaroundDays: number | null;
  turnaroundKnown: boolean;
  requiredFleet: number;
  ownFleet: number;
  maintenanceFleet: number;
  netOperationalCapacity: number;
  capacityGap: number;
  subcontractRequired: number;
  readinessPct: number;
}

interface FleetPlan {
  period: string;
  days: number;
  lines: FleetLine[];
  totalRequiredFleet: number;
  totalNetCapacity: number;
  totalSubcontractRequired: number;
  overallReadinessPct: number;
  linesMissingTurnaround: number;
}

type Horizon = "month" | "quarter" | "year";

/** Period labels the API understands, newest first. */
function periodsFor(horizon: Horizon, now = new Date()): string[] {
  const year = now.getUTCFullYear();
  if (horizon === "year") return [year + 1, year, year - 1].map(String);
  if (horizon === "quarter") {
    return [year + 1, year].flatMap((y) => [4, 3, 2, 1].map((q) => `${y}-Q${q}`));
  }
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(Date.UTC(year, now.getUTCMonth() + 3 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const CORRIDORS = [
  { value: "ALL", label: "All corridors" },
  { value: "NORTHERN", label: "Northern" },
  { value: "CENTRAL", label: "Central" },
  { value: "DOMESTIC", label: "Domestic" },
];

const SCENARIOS = [
  { value: "BASE", label: "Realistic / base" },
  { value: "OPTIMISTIC", label: "Optimistic" },
  { value: "PESSIMISTIC", label: "Pessimistic" },
];

const EQUIPMENT_LABEL: Record<string, string> = {
  FLATBED: "Flatbed", DRY_VAN: "Dry van", REEFER: "Reefer", TANKER: "Tanker",
  CONTAINER_20FT: "20ft container", CONTAINER_40FT: "40ft container",
  CURTAIN_SIDE: "Curtain side", LTL: "LTL", OTHER: "Other",
};

/**
 * Demand for a period against the fleet that can actually serve it.
 *
 * The requirement turns on turnaround time, so a corridor that takes twelve
 * days to round-trip needs four times the trucks of a three-day one for the
 * same number of loads. A line whose turnaround was never entered is marked,
 * because its requirement is a placeholder rather than a plan.
 */
export function CapacityPanel() {
  const [horizon, setHorizon] = useState<Horizon>("month");
  const [period, setPeriod] = useState<string>(() => periodsFor("month")[3]);
  const [corridor, setCorridor] = useState("ALL");
  const [scenario, setScenario] = useState("BASE");
  const [plan, setPlan] = useState<FleetPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const periods = useMemo(() => periodsFor(horizon), [horizon]);

  function changeHorizon(next: Horizon) {
    setHorizon(next);
    // The current label belongs to the old horizon, so move to a valid one.
    const list = periodsFor(next);
    setPeriod(next === "month" ? list[3] : list[0]);
  }

  const filters = useMemo(
    () => ({
      period,
      ...(corridor !== "ALL" ? { corridor } : {}),
      ...(scenario !== "BASE" ? { scenario } : {}),
    }),
    [period, corridor, scenario],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters);
      setPlan(await apiFetch<FleetPlan>(`/api/planning/fleet-plan?${params}`));
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const tiles = plan
    ? [
        { label: "Required fleet", value: plan.totalRequiredFleet, hint: `over ${plan.days} days` },
        { label: "Net operational capacity", value: plan.totalNetCapacity, hint: "own fleet less workshop" },
        {
          label: "Subcontract needed",
          value: plan.totalSubcontractRequired,
          hint: "third-party trucks to hire",
          alert: plan.totalSubcontractRequired > 0,
        },
        {
          label: "Readiness",
          value: `${plan.overallReadinessPct}%`,
          hint: "of dispatchable capacity",
          alert: plan.overallReadinessPct > 100,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Horizon</Label>
          <Select value={horizon} onValueChange={(v) => changeHorizon(v as Horizon)}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="quarter">Quarterly</SelectItem>
              <SelectItem value="year">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Period</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Corridor</Label>
          <Select value={corridor} onValueChange={setCorridor}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CORRIDORS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Scenario</Label>
          <Select value={scenario} onValueChange={setScenario}>
            <SelectTrigger className="w-[165px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SCENARIOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>Recalculate</Button>
          <ExportMenu endpoint="/api/planning/fleet-plan" filters={filters} label="Export plan" />
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-card px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${t.alert ? "text-destructive" : ""}`}>
              {loading ? "—" : t.value}
            </p>
            <p className="mt-0.5 min-h-4 text-xs text-muted-foreground">{t.hint}</p>
          </div>
        ))}
      </div>

      {plan && plan.linesMissingTurnaround > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {plan.linesMissingTurnaround} forecast{plan.linesMissingTurnaround === 1 ? " has" : "s have"} no
            turnaround time, so the required fleet for {plan.linesMissingTurnaround === 1 ? "it" : "them"} is
            counted as one truck per load. Set the cycle days on the forecast for a real figure.
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-md border">
        {loading ? (
          <div className="py-10"><Loader /></div>
        ) : !plan || plan.lines.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No confirmed forecasts for {period}. Add one below and confirm it to see the capacity plan.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corridor</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead className="text-right">Loads</TableHead>
                <TableHead className="text-right">Turnaround</TableHead>
                <TableHead className="text-right">Required</TableHead>
                <TableHead className="text-right">Own</TableHead>
                <TableHead className="text-right">Workshop</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Gap</TableHead>
                <TableHead className="text-right">Subcontract</TableHead>
                <TableHead className="text-right">Readiness</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.lines.map((l, i) => (
                <TableRow key={`${l.corridor}-${l.equipmentClass}-${i}`}>
                  <TableCell className="font-medium">{l.corridor}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.equipmentClass ? EQUIPMENT_LABEL[l.equipmentClass] ?? l.equipmentClass : "Any"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.forecastLoads}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.turnaroundKnown ? `${l.turnaroundDays}d` : <span className="text-warning">not set</span>}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{l.requiredFleet}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{l.ownFleet}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{l.maintenanceFleet}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.netOperationalCapacity}</TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${l.capacityGap < 0 ? "text-destructive" : "text-success"}`}>
                    {l.capacityGap > 0 ? `+${l.capacityGap}` : l.capacityGap}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.subcontractRequired > 0
                      ? <span className="font-semibold text-destructive">{l.subcontractRequired}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${l.readinessPct > 100 ? "text-destructive" : ""}`}>
                    {l.readinessPct}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
