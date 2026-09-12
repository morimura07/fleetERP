"use client";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Paperclip, Plus } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { KpiRibbon } from "@frontend/components/data/kpi-ribbon";
import { AttachmentsPanel } from "@frontend/components/data/attachments-panel";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import { damageReportSchema, type DamageReportInput } from "@frontend/lib/validations";
import {
  DAMAGE_STATUS_LABEL, DAMAGE_STATUS_VARIANT,
  INCIDENT_TYPE_LABEL, INCIDENT_CAUSE_LABEL, CLAIM_STATUS_LABEL, CLAIM_STATUS_VARIANT,
} from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { DamageStatus, IncidentType, IncidentCause, ClaimStatus } from "@frontend/lib/enums";

type Trip = { id: string; tripCode: string };
type Order = { id: string; orderCode: string };
type Vehicle = { id: string; plateNumber: string; vehicleNumber: string };
type Driver = { id: string; name: string };
type Client = { id: string; companyName: string };

interface IncidentRow {
  id: string; reportNumber: string; status: DamageStatus; reportedAt: string;
  cargoValue: string; damageValue: string; currency: string; description: string | null;
  incidentType: IncidentType; location: string | null;
  rootCause: IncidentCause; liableParty: string | null;
  claimStatus: ClaimStatus; claimNumber: string | null; settlementAmount: string;
  order: { orderCode: string } | null;
  trip: { tripCode: string } | null;
  client: { companyName: string } | null;
  vehicle: { vehicleNumber: string; plateNumber: string } | null;
  driver: { name: string } | null;
}

const STATUSES: DamageStatus[] = ["REPORTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "SETTLED"];
const NONE = "none";

const money = (v: string, c: string) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const today = () => new Date().toISOString().slice(0, 10);

/** Share of the shipment's value that was lost. Derived, never stored — a saved
 *  copy would go stale the moment either figure is corrected on assessment. */
function damageRatio(row: IncidentRow): string {
  const cargo = parseFloat(row.cargoValue);
  if (!cargo) return "—";
  return `${Math.round((parseFloat(row.damageValue) / cargo) * 1000) / 10}%`;
}

interface IncidentSummary {
  currency: string | null;
  damageRatePct: number;
  totalIncurredLoss: string;
  totalClaimedYtd: string;
  recoveryRatePct: number;
  reports: number;
  excludedOtherCurrency: number;
}

const STATUS_TABS = [
  { value: NONE, label: "All" },
  ...STATUSES.map((s) => ({ value: s as string, label: DAMAGE_STATUS_LABEL[s] })),
];

const CORRIDORS = [
  { value: "NORTHERN", label: "Northern" },
  { value: "CENTRAL", label: "Central" },
  { value: "DOMESTIC", label: "Domestic" },
];

export function IncidentReportsManager({
  orders, trips, vehicles, drivers, clients,
}: {
  orders: Order[]; trips: Trip[]; vehicles: Vehicle[]; drivers: Driver[]; clients: Client[];
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [claimFilter, setClaimFilter] = useState<string>(NONE);
  const [statusTab, setStatusTab] = useState<string>(NONE);
  const [corridor, setCorridor] = useState<string>(NONE);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [evidence, setEvidence] = useState<Record<string, number>>({});
  const [docsFor, setDocsFor] = useState<IncidentRow | null>(null);
  const form = useForm<DamageReportInput>({ resolver: zodResolver(damageReportSchema) });

  /**
   * Evidence counts for the rows on screen, in one request rather than one per
   * row. Called by the table as each page loads.
   */
  const loadEvidence = useCallback(async (visible: IncidentRow[]) => {
    if (visible.length === 0) return setEvidence({});
    try {
      const counts = await apiFetch<Record<string, number>>(
        `/api/attachments/counts?entityType=DamageReport&ids=${visible.map((r) => r.id).join(",")}`,
      );
      setEvidence(counts);
    } catch {
      setEvidence({});
    }
  }, []);

  const filters = useMemo(
    () => ({
      ...(claimFilter !== NONE ? { claimStatus: claimFilter } : {}),
      ...(statusTab !== NONE ? { status: statusTab } : {}),
      ...(corridor !== NONE ? { corridor } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [claimFilter, statusTab, corridor, from, to],
  );

  function openCreate() {
    form.reset({
      orderId: "", tripId: "", clientId: "", vehicleId: "", driverId: "",
      reportedAt: today() as unknown as Date,
      cargoValue: 0, damageValue: 0, currency: "USD", description: "",
      incidentType: "TRANSIT_DAMAGE", location: "", rootCause: "UNDETERMINED", liableParty: "",
      insurerName: "", claimNumber: "", claimStatus: "NOT_FILED", settlementAmount: 0,
    });
    setOpen(true);
  }

  async function onSubmit(data: DamageReportInput) {
    try {
      await apiFetch("/api/operational-kpi/damage-reports", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Incident logged", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function advance(id: string, status: DamageStatus) {
    try {
      await apiFetch(`/api/operational-kpi/damage-reports/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast({ title: `Marked ${DAMAGE_STATUS_LABEL[status]}`, variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<IncidentRow>[] = [
    { key: "reportNumber", header: "Report", render: (r) => <span className="font-mono">{r.reportNumber}</span> },
    { key: "reportedAt", header: "Date", render: (r) => <span className="text-xs">{day(r.reportedAt)}</span> },
    { key: "client", header: "Customer", render: (r) => r.client?.companyName ?? r.order?.orderCode ?? "—" },
    { key: "incidentType", header: "Type", render: (r) => <span className="text-xs">{INCIDENT_TYPE_LABEL[r.incidentType]}</span> },
    {
      key: "vehicle", header: "Vehicle / Trip",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.vehicle ? `${r.vehicle.vehicleNumber}` : "—"}{r.trip ? ` / ${r.trip.tripCode}` : ""}
        </span>
      ),
    },
    { key: "driver", header: "Driver", render: (r) => r.driver?.name ?? "—" },
    { key: "damageValue", header: "Loss", render: (r) => <span className="tabular-nums text-destructive">{money(r.damageValue, r.currency)}</span> },
    { key: "ratio", header: "Ratio", render: (r) => <span className="tabular-nums text-xs">{damageRatio(r)}</span> },
    { key: "claimStatus", header: "Claim", render: (r) => <Badge variant={CLAIM_STATUS_VARIANT[r.claimStatus]}>{CLAIM_STATUS_LABEL[r.claimStatus]}</Badge> },
    { key: "status", header: "Status", render: (r) => <Badge variant={DAMAGE_STATUS_VARIANT[r.status]}>{DAMAGE_STATUS_LABEL[r.status]}</Badge> },
    {
      key: "evidence", header: "Evidence",
      render: (r) => (
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={() => setDocsFor(r)}>
          <Paperclip className="h-3.5 w-3.5" />
          <span className="tabular-nums">{evidence[r.id] ?? 0}</span>
        </Button>
      ),
    },
  ];

  return (
    <>
      <KpiRibbon<IncidentSummary>
        endpoint="/api/operational-kpi/damage-reports/summary"
        filters={filters}
        refreshKey={refreshKey}
        tiles={(s) => [
          {
            label: "Damage & claim rate",
            value: s ? `${s.damageRatePct}%` : "—",
            hint: "of cargo value carried",
            tone: s && s.damageRatePct > 5 ? "warn" : "default",
          },
          {
            label: "Total incurred loss",
            value: s?.currency ? money(s.totalIncurredLoss, s.currency) : "—",
            // Mixed-currency incidents cannot be added, so say what was left out
            // rather than showing a total that quietly spans two currencies.
            hint: s?.excludedOtherCurrency
              ? `${s.excludedOtherCurrency} report${s.excludedOtherCurrency === 1 ? "" : "s"} in other currencies excluded`
              : `across ${s?.reports ?? 0} report${s?.reports === 1 ? "" : "s"}`,
            tone: "danger",
          },
          {
            label: "Total claimed YTD",
            value: s?.currency ? money(s.totalClaimedYtd, s.currency) : "—",
            hint: "assessed loss on filed claims",
          },
          {
            label: "Recovery rate",
            value: s ? `${s.recoveryRatePct}%` : "—",
            hint: "settled against loss",
            tone: s && s.recoveryRatePct < 50 ? "warn" : "default",
          },
        ]}
      />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant={statusTab === t.value ? "default" : "outline"}
            onClick={() => setStatusTab(t.value)}
          >
            {t.label}
          </Button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={corridor} onValueChange={setCorridor}>
            <SelectTrigger className="h-9 w-[10rem]"><SelectValue placeholder="All corridors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All corridors</SelectItem>
              {CORRIDORS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" aria-label="Reported from" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" aria-label="Reported to" />
        </div>
      </div>

      <DataTable<IncidentRow>
        endpoint="/api/operational-kpi/damage-reports"
        columns={columns}
        filters={filters}
        searchPlaceholder="Search report no. or description"
        refreshKey={refreshKey}
        onRows={loadEvidence}
        toolbar={
          <div className="flex items-center gap-2">
            <Select value={claimFilter} onValueChange={setClaimFilter}>
              <SelectTrigger className="h-9 w-[11rem]"><SelectValue placeholder="All claims" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All claims</SelectItem>
                {(Object.keys(CLAIM_STATUS_LABEL) as ClaimStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{CLAIM_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={openCreate}><Plus className="h-4 w-4" />Log Incident</Button>
          </div>
        }
        rowActions={(r) => (
          <Select value={r.status} onValueChange={(v) => advance(r.id, v as DamageStatus)}>
            <SelectTrigger className="h-8 w-[9rem]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{DAMAGE_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Log Incident</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Report Date</Label>
                <Input type="date" {...form.register("reportedAt")} />
                {form.formState.errors.reportedAt && <p className="text-xs text-destructive">{form.formState.errors.reportedAt.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Incident Type</Label>
                <Select value={form.watch("incidentType")} onValueChange={(v) => form.setValue("incidentType", v as IncidentType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(INCIDENT_TYPE_LABEL) as IncidentType[]).map((t) => (
                      <SelectItem key={t} value={t}>{INCIDENT_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cargo Value</Label>
                <Input type="number" step="0.01" {...form.register("cargoValue")} />
                {form.formState.errors.cargoValue && <p className="text-xs text-destructive">{form.formState.errors.cargoValue.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Loss Value</Label>
                <Input type="number" step="0.01" {...form.register("damageValue")} />
                {form.formState.errors.damageValue && <p className="text-xs text-destructive">{form.formState.errors.damageValue.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <CurrencySelect value={form.watch("currency")} onChange={(v) => form.setValue("currency", v)} />
              </div>
              <div className="space-y-1.5">
                <Label>Location of Incident</Label>
                <Input placeholder="In transit / Offloading point - Tunduma" {...form.register("location")} />
              </div>
            </div>

            <FormSection title="Who and what was involved">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={form.watch("clientId") || NONE} onValueChange={(v) => form.setValue("clientId", v === NONE ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None —</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Driver</Label>
                <Select value={form.watch("driverId") || NONE} onValueChange={(v) => form.setValue("driverId", v === NONE ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None —</SelectItem>
                    {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vehicle</Label>
                <Select value={form.watch("vehicleId") || NONE} onValueChange={(v) => form.setValue("vehicleId", v === NONE ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None —</SelectItem>
                    {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicleNumber} ({v.plateNumber})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Order</Label>
                <Select value={form.watch("orderId") || NONE} onValueChange={(v) => form.setValue("orderId", v === NONE ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None —</SelectItem>
                    {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderCode}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Trip</Label>
                <Select value={form.watch("tripId") || NONE} onValueChange={(v) => form.setValue("tripId", v === NONE ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None —</SelectItem>
                    {trips.map((t) => <SelectItem key={t.id} value={t.id}>{t.tripCode}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </FormSection>

            <FormSection title="Cause and liability">
              <div className="space-y-1.5">
                <Label>Root Cause</Label>
                <Select value={form.watch("rootCause")} onValueChange={(v) => form.setValue("rootCause", v as IncidentCause)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(INCIDENT_CAUSE_LABEL) as IncidentCause[]).map((c) => (
                      <SelectItem key={c} value={c}>{INCIDENT_CAUSE_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Liable Party</Label>
                <Input placeholder="Driver / sub-contractor / third party" {...form.register("liableParty")} />
              </div>
            </FormSection>

            <FormSection title="Insurance recovery">
              <div className="space-y-1.5">
                <Label>Insurer</Label>
                <Input {...form.register("insurerName")} />
              </div>
              <div className="space-y-1.5">
                <Label>Claim Number</Label>
                <Input {...form.register("claimNumber")} />
              </div>
              <div className="space-y-1.5">
                <Label>Claim Status</Label>
                <Select value={form.watch("claimStatus")} onValueChange={(v) => form.setValue("claimStatus", v as ClaimStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CLAIM_STATUS_LABEL) as ClaimStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{CLAIM_STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Settlement / Recovery</Label>
                <Input type="number" step="0.01" {...form.register("settlementAmount")} />
              </div>
            </FormSection>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input placeholder="Water damage to 40 cartons on offload" {...form.register("description")} />
            </div>

            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Log Incident</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={docsFor !== null} onOpenChange={(o) => !o && setDocsFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Evidence for {docsFor?.reportNumber}</DialogTitle>
          </DialogHeader>
          {docsFor && (
            <AttachmentsPanel
              entityType="DamageReport"
              entityId={docsFor.id}
              // Keeps the row badge honest without reloading the whole table.
              onCountChange={(n) => setEvidence((e) => ({ ...e, [docsFor.id]: n }))}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
