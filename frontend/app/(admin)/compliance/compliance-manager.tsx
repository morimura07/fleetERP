"use client";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, XCircle, HelpCircle, Truck, User, Fuel } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Badge } from "@frontend/components/ui/badge";
import { Loader } from "@frontend/components/ui/loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@frontend/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@frontend/components/ui/table";
import { apiFetch } from "@frontend/lib/fetcher";
import { DOC_BUCKET_LABEL, DOC_BUCKET_VARIANT, FUEL_STATUS_LABEL, FUEL_STATUS_VARIANT } from "@frontend/lib/labels";
import type { LucideIcon } from "lucide-react";

interface ComplianceItem {
  ownerType: "VEHICLE" | "DRIVER"; ownerLabel: string;
  docType: string; number: string | null; expiresAt: string | null; status: string;
}
interface ComplianceReport {
  asOf: string; warningDays: number; items: ComplianceItem[];
  summary: { current: number; expiringSoon: number; expired: number; missing: number };
}
interface FuelStat {
  vehicleId: string; plateNumber: string; model: string;
  actualKmPerL: string | null; targetKmPerL: string | null; variancePct: string | null;
  status: string; totalKm: string; totalLitres: string; tripCount: number;
}

function StatTile({ title, value, icon: Icon, tile }: { title: string; value: number; icon: LucideIcon; tile: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tile}`}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentsTab() {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setReport(await apiFetch<ComplianceReport>("/api/compliance")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !report) return <Loader size={36} label="Loading compliance…" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile title="Current" value={report.summary.current} icon={ShieldCheck} tile="text-emerald-400 bg-emerald-400/10" />
        <StatTile title="Expiring Soon" value={report.summary.expiringSoon} icon={AlertTriangle} tile="text-amber-400 bg-amber-400/10" />
        <StatTile title="Expired" value={report.summary.expired} icon={XCircle} tile="text-red-400 bg-red-400/10" />
        <StatTile title="Missing" value={report.summary.missing} icon={HelpCircle} tile="text-slate-400 bg-slate-400/10" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document Lifecycle</CardTitle>
          <p className="text-sm text-muted-foreground">As of {report.asOf} · {report.warningDays}-day warning window · worst first</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-wider">Owner</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">Document</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">Number</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">Expires</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {it.ownerType === "VEHICLE" ? <Truck className="h-3.5 w-3.5 text-muted-foreground" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                      {it.ownerLabel}
                    </span>
                  </TableCell>
                  <TableCell>{it.docType}</TableCell>
                  <TableCell className="font-mono text-xs">{it.number ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{it.expiresAt ?? "—"}</TableCell>
                  <TableCell><Badge variant={DOC_BUCKET_VARIANT[it.status]}>{DOC_BUCKET_LABEL[it.status]}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FuelTab() {
  const [stats, setStats] = useState<FuelStat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStats(await apiFetch<FuelStat[]>("/api/fuel")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader size={36} label="Loading fuel data…" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Fuel className="h-4 w-4" />Fuel Efficiency</CardTitle>
        <p className="text-sm text-muted-foreground">Actual km/L from completed trips vs per-vehicle target</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase tracking-wider">Vehicle</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider">Total km</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider">Litres</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider">Actual km/L</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider">Target</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wider">Variance</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((s) => (
              <TableRow key={s.vehicleId}>
                <TableCell><span className="font-medium">{s.plateNumber}</span> <span className="text-xs text-muted-foreground">{s.model}</span></TableCell>
                <TableCell className="text-right tabular-nums">{s.totalKm}</TableCell>
                <TableCell className="text-right tabular-nums">{s.totalLitres}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{s.actualKmPerL ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.targetKmPerL ?? "—"}</TableCell>
                <TableCell className={`text-right tabular-nums ${s.variancePct && parseFloat(s.variancePct) < 0 ? "text-destructive" : ""}`}>{s.variancePct ? `${s.variancePct}%` : "—"}</TableCell>
                <TableCell><Badge variant={FUEL_STATUS_VARIANT[s.status]}>{FUEL_STATUS_LABEL[s.status]}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function ComplianceManager() {
  return (
    <Tabs defaultValue="documents">
      <TabsList>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="fuel">Fuel Efficiency</TabsTrigger>
      </TabsList>
      <TabsContent value="documents"><DocumentsTab /></TabsContent>
      <TabsContent value="fuel"><FuelTab /></TabsContent>
    </Tabs>
  );
}
