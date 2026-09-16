"use client";
import { useCallback, useEffect, useState } from "react";
import { Play, RefreshCw, BookCheck, Trash2, AlertTriangle, Info } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Loader } from "@frontend/components/ui/loader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { ExportMenu } from "@frontend/components/data/export-menu";
import { RATE_TYPE_LABEL } from "@frontend/lib/labels";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { type Available, type EntityRow, type RunRow, type RunDetail, STATUS_LABEL, STATUS_VARIANT, TYPE_LABEL, amt, thisMonth } from "./shared";

/**
 * Run controls, the run list and the run table (client requirements,
 * Sept 2026, Consolidation §1-2). One run is selected at a time; its lines
 * are the snapshot saved when it was translated.
 */

type PeriodKind = "month" | "quarter" | "year" | "asof";

export function RunPanel({ parentArea, available, entities }: { parentArea: string; available: Available; entities: EntityRow[] }) {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<PeriodKind>("month");
  const [month, setMonth] = useState(thisMonth());
  const [quarter, setQuarter] = useState(`${new Date().getUTCFullYear()}-Q${Math.floor(new Date().getUTCMonth() / 3) + 1}`);
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [subs, setSubs] = useState<string[]>([]);
  const [entityFilter, setEntityFilter] = useState<string>("all");

  const period = kind === "month" ? month : kind === "quarter" ? quarter : kind === "year" ? year : asOf;
  const base = available.companies.find((c) => c.code === parentArea)?.baseCurrency ?? "USD";
  const configured = entities.filter((e) => e.isActive).map((e) => e.subsidiary);

  const loadRuns = useCallback(async () => {
    try {
      const rows = await apiFetch<RunRow[]>(`/api/consolidation/runs?parentArea=${parentArea}&pageSize=50`);
      setRuns(rows);
      setSelectedId((cur) => cur && rows.some((r) => r.id === cur) ? cur : rows[0]?.id ?? null);
    } catch (e) { fail(e); }
  }, [parentArea, fail]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const loadRun = useCallback(async (id: string) => {
    setLoadingRun(true);
    try { setRun(await apiFetch<RunDetail>(`/api/consolidation/runs/${id}`)); }
    catch (e) { fail(e); setRun(null); }
    finally { setLoadingRun(false); }
  }, [fail]);
  useEffect(() => { if (selectedId) loadRun(selectedId); else setRun(null); }, [selectedId, loadRun]);

  async function act(label: string, fn: () => Promise<unknown>, reload = true) {
    setBusy(true);
    try {
      await fn();
      toast({ title: label, variant: "success" });
      if (reload) { await loadRuns(); if (selectedId) await loadRun(selectedId); }
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  async function createRun() {
    setBusy(true);
    try {
      const created = await apiFetch<RunDetail>("/api/consolidation/runs", {
        method: "POST", body: JSON.stringify({ parentArea, baseCurrency: base, period, subsidiaries: subs }),
      });
      toast({ title: `Translated ${created.period}`, description: `${created.lines.length} lines, CTA ${amt(created.summary.ctaBase, base)}`, variant: "success" });
      await loadRuns();
      setSelectedId(created.id);
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  const lines = run?.lines.filter((l) => entityFilter === "all" || l.subsidiary === entityFilter) ?? [];
  const warnings = run?.warnings;
  const icOff = warnings && Number(warnings.icMismatchBase) !== 0;

  return (
    <div className="space-y-4">
      {/* ── Controls ── */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <div className="flex gap-1">
              <Select value={kind} onValueChange={(v) => setKind(v as PeriodKind)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                  <SelectItem value="asof">As of date</SelectItem>
                </SelectContent>
              </Select>
              {kind === "month" && <Input type="month" className="w-40" value={month} onChange={(e) => setMonth(e.target.value)} />}
              {kind === "quarter" && <Input className="w-32" placeholder="2026-Q3" value={quarter} onChange={(e) => setQuarter(e.target.value.toUpperCase())} />}
              {kind === "year" && <Input type="number" className="w-28" value={year} onChange={(e) => setYear(e.target.value)} />}
              {kind === "asof" && <Input type="date" className="w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} />}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subsidiaries</Label>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => setSubs([])} className={`rounded border px-2 py-1 text-xs ${subs.length === 0 ? "border-primary bg-primary/15" : "text-muted-foreground"}`}>All ({configured.length})</button>
              {configured.map((s) => {
                const co = available.companies.find((c) => c.code === s);
                const on = subs.includes(s);
                return (
                  <button key={s} type="button" onClick={() => setSubs(on ? subs.filter((x) => x !== s) : [...subs, s])}
                    className={`rounded border px-2 py-1 text-xs ${on ? "border-primary bg-primary/15" : "text-muted-foreground"}`}>
                    {s}{co ? ` · ${co.name} (${co.baseCurrency})` : ""}
                  </button>
                );
              })}
              {configured.length === 0 && <span className="text-xs text-muted-foreground">Add a subsidiary in the mapping section first.</span>}
            </div>
          </div>
          <div className="ml-auto">
            <Button onClick={createRun} disabled={busy || configured.length === 0 || !period}><Play className="h-4 w-4" />Run translation</Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Runs ── */}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-sm">Runs</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet. Pick a period and run the translation.</p>}
            {runs.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
                className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm ${r.id === selectedId ? "border-primary bg-primary/10" : "border-transparent hover:bg-elevated"}`}>
                <span className="font-mono">{r.period}</span>
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{run ? `Consolidation ${run.period}` : "Consolidation run"}</CardTitle>
              {run && (
                <p className="text-xs text-muted-foreground">
                  {run.periodStart.slice(0, 10)} to {run.periodEnd.slice(0, 10)} · {run.subsidiaries.join(", ")} into {run.parentArea} ({run.baseCurrency})
                  {run.ranAt && ` · translated ${new Date(run.ranAt).toLocaleString()}`}
                  {run.postedAt && ` · posted ${new Date(run.postedAt).toLocaleString()}`}
                </p>
              )}
            </div>
            {run && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[run.status]}>{STATUS_LABEL[run.status]}</Badge>
                {run.status !== "POSTED" && (
                  <>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => act("Translated again", () => apiFetch(`/api/consolidation/runs/${run.id}/run`, { method: "POST" }))}><RefreshCw className="h-4 w-4" />Run again</Button>
                    <Button size="sm" disabled={busy || !!icOff} title={icOff ? "Intercompany balances must net to zero first" : undefined}
                      onClick={() => act("Eliminations posted", () => apiFetch(`/api/consolidation/runs/${run.id}/post`, { method: "POST" }))}>
                      <BookCheck className="h-4 w-4" />Post eliminations
                    </Button>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => act("Run deleted", async () => { await apiFetch(`/api/consolidation/runs/${run.id}`, { method: "DELETE" }); setSelectedId(null); })}><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
                <ExportMenu endpoint={`/api/consolidation/runs/${run.id}`} label="Export" />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loadingRun ? <Loader size={36} label="Loading run…" /> : !run ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Select a run, or create one above.</p>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Tile label="Consolidated total" value={amt(run.summary.consolidatedBase, run.baseCurrency)} hint="debits less credits; zero when the group balances" />
                  <Tile label="Eliminations" value={amt(run.summary.eliminationBase, run.baseCurrency)} hint="intercompany removed" />
                  <Tile label="CTA (equity)" value={amt(run.summary.ctaBase, run.baseCurrency)} hint="cumulative translation adjustment" />
                  <Tile label="Translation gain / loss" value={amt(run.summary.ctaActivityBase, run.baseCurrency)} hint="movement in CTA this period" tone={Number(run.summary.ctaActivityBase) > 0 ? "warn" : undefined} />
                </div>

                {/* Warnings */}
                {warnings && (warnings.unmapped.length > 0 || warnings.missingRates.length > 0 || icOff) && (
                  <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                    {icOff && <p className="flex items-center gap-2 text-amber-500"><AlertTriangle className="h-4 w-4" />Intercompany balances do not net to zero: {amt(warnings.icMismatchBase, run.baseCurrency)}. Flag the other side of each balance in the mapping, then run again.</p>}
                    {warnings.missingRates.length > 0 && <p className="flex items-center gap-2 text-amber-500"><AlertTriangle className="h-4 w-4" />No rate configured for {warnings.missingRates.join(", ")} at the period end.</p>}
                    {warnings.unmapped.length > 0 && <p className="flex items-center gap-2 text-amber-500"><AlertTriangle className="h-4 w-4" />Unmapped accounts rolled up under their own code: {warnings.unmapped.join(", ")}</p>}
                  </div>
                )}
                {warnings && warnings.notes.filter((n) => !/net to zero/.test(n)).map((n) => (
                  <p key={n} className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" />{n}</p>
                ))}

                {/* Entities */}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Show</span>
                  <button type="button" onClick={() => setEntityFilter("all")} className={`rounded border px-2 py-0.5 text-xs ${entityFilter === "all" ? "border-primary bg-primary/15" : "text-muted-foreground"}`}>All entities</button>
                  {run.summary.byEntity.map((e) => (
                    <button key={e.subsidiary} type="button" onClick={() => setEntityFilter(e.subsidiary)} className={`rounded border px-2 py-0.5 text-xs ${entityFilter === e.subsidiary ? "border-primary bg-primary/15" : "text-muted-foreground"}`}>
                      {e.subsidiary} · {e.currency} · {e.lines} accounts{e.subsidiary !== run.parentArea ? ` · ${Number(e.sharePct)}%` : ""}
                    </button>
                  ))}
                </div>

                {/* Lines */}
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full whitespace-nowrap text-xs">
                    <thead className="bg-elevated/80 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Entity</th>
                        <th className="p-2 text-left">Account</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Parent account</th>
                        <th className="p-2 text-left">Ccy</th>
                        <th className="p-2 text-right">Beginning</th>
                        <th className="p-2 text-right">Debit</th>
                        <th className="p-2 text-right">Credit</th>
                        <th className="p-2 text-right">Ending</th>
                        <th className="p-2 text-left">Rate</th>
                        <th className="p-2 text-right">Beginning {run.baseCurrency}</th>
                        <th className="p-2 text-right">Activity {run.baseCurrency}</th>
                        <th className="p-2 text-right">Ending {run.baseCurrency}</th>
                        <th className="p-2 text-right">Elimination</th>
                        <th className="p-2 text-right">Share</th>
                        <th className="p-2 text-right">Consolidated</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {lines.length === 0 && <tr><td colSpan={16} className="p-4 text-center text-muted-foreground">No posted balances in this period.</td></tr>}
                      {lines.map((l) => (
                        <tr key={l.id} className={`border-t ${l.isCta ? "bg-sky-500/5 font-medium" : ""}`}>
                          <td className="p-2 font-mono">{l.subsidiary}</td>
                          <td className="p-2"><span className="font-mono">{l.subAccount}</span> <span className="text-muted-foreground">{l.subAccountName}</span>{l.intercompany && <Badge variant="info" className="ml-1">IC</Badge>}</td>
                          <td className="p-2 text-muted-foreground">{TYPE_LABEL[l.accountType]}</td>
                          <td className="p-2"><span className="font-mono">{l.parentAccount}</span> <span className="text-muted-foreground">{l.parentAccountName}</span></td>
                          <td className="p-2 font-mono">{l.currency}</td>
                          <td className="p-2 text-right">{l.isCta ? "" : amt(l.beginningLocal)}</td>
                          <td className="p-2 text-right">{l.isCta ? "" : amt(l.debitLocal)}</td>
                          <td className="p-2 text-right">{l.isCta ? "" : amt(l.creditLocal)}</td>
                          <td className="p-2 text-right">{l.isCta ? "" : amt(l.endingLocal)}</td>
                          <td className="p-2 text-muted-foreground">{l.isCta ? "derived" : `${RATE_TYPE_LABEL[l.rateType]}${l.rate ? ` ${Number(l.rate)}` : " (none)"}`}</td>
                          <td className="p-2 text-right">{amt(l.beginningBase)}</td>
                          <td className="p-2 text-right">{amt(l.activityBase)}</td>
                          <td className="p-2 text-right">{amt(l.endingBase)}</td>
                          <td className="p-2 text-right">{Number(l.eliminationBase) ? amt(l.eliminationBase) : ""}</td>
                          <td className="p-2 text-right">{Number(l.sharePct)}%</td>
                          <td className="p-2 text-right font-semibold">{amt(l.consolidatedBase)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Roll-up */}
                <details className="rounded-md border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Consolidated by parent account</summary>
                  <table className="w-full text-sm">
                    <tbody className="tabular-nums">
                      {run.summary.byParentAccount.map((r) => (
                        <tr key={r.parentAccount} className="border-t">
                          <td className="p-2 font-mono">{r.parentAccount}</td>
                          <td className="p-2">{r.parentAccountName}</td>
                          <td className="p-2 text-muted-foreground">{TYPE_LABEL[r.accountType]}</td>
                          <td className="p-2 text-right">{amt(r.consolidatedBase, run.baseCurrency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>

                {run.status === "POSTED" && run.postingEntryId && (
                  <p className="text-xs text-muted-foreground">Elimination entries posted to {run.parentArea} as journal entry <code className="font-mono">{run.postingEntryId}</code> (reference CONS-{run.period}). The CTA is presented in equity and is not posted.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone === "warn" ? "text-amber-400" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
