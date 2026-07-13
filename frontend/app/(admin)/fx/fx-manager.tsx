"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Scale, CheckCircle2 } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { exchangeRateSchema, type ExchangeRateInput } from "@frontend/lib/validations";
import { RATE_TYPE_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { RateType } from "@frontend/lib/enums";

interface Rate extends ExchangeRateInput { id: string; }

const RATE_TYPES = Object.keys(RATE_TYPE_LABEL) as RateType[];

const fmtDate = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

const columns: Column<Rate>[] = [
  { key: "currency", header: "Currency", render: (r) => <span className="font-mono">{r.currency} → {r.baseCurrency}</span> },
  { key: "rateType", header: "Type", render: (r) => <Badge variant="outline">{RATE_TYPE_LABEL[r.rateType as RateType]}</Badge> },
  { key: "rate", header: "Rate", render: (r) => <span className="tabular-nums">{r.rate}</span> },
  { key: "validFrom", header: "Valid From", render: (r) => <span className="tabular-nums">{fmtDate(r.validFrom)}</span> },
  { key: "dataAreaId", header: "Entity" },
];

export function FxManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<ExchangeRateInput>({ resolver: zodResolver(exchangeRateSchema) });

  function openCreate() {
    form.reset({ dataAreaId: "HQ01", currency: "", baseCurrency: "USD", rateType: "SPOT", rate: "", validFrom: new Date() });
    setOpen(true);
  }

  async function onSubmit(data: ExchangeRateInput) {
    try {
      await apiFetch("/api/fx", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Rate saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  return (
    <>
      <RevaluationPanel />

      <DataTable<Rate>
        endpoint="/api/fx"
        columns={columns}
        searchPlaceholder="Search by currency"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Rate</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Exchange Rate</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input maxLength={3} placeholder="TZS" {...form.register("currency")} />
                {form.formState.errors.currency && <p className="text-xs text-destructive">{form.formState.errors.currency.message}</p>}
              </div>
              <div className="space-y-1.5"><Label>Base Currency</Label><Input maxLength={3} {...form.register("baseCurrency")} /></div>
              <div className="space-y-1.5">
                <Label>Rate Type</Label>
                <Select value={form.watch("rateType")} onValueChange={(v) => form.setValue("rateType", v as RateType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RATE_TYPES.map((t) => <SelectItem key={t} value={t}>{RATE_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rate (foreign × rate = base)</Label>
                <Input placeholder="0.000385" {...form.register("rate")} />
                {form.formState.errors.rate && <p className="text-xs text-destructive">{form.formState.errors.rate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Valid From</Label>
                <Input type="date" {...form.register("validFrom")} />
              </div>
              <div className="space-y-1.5"><Label>Entity</Label><Input maxLength={10} {...form.register("dataAreaId")} /></div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Period-end multi-currency revaluation (M8) ───────────────────────────────

interface RevalLine {
  kind: "AP" | "AR"; invoiceNumber: string; currency: string; outstanding: string;
  bookingRate: string; periodRate: string; baseAtBooking: string; baseAtPeriod: string; delta: string;
}
interface RevalResult {
  baseCurrency: string; asOf: string; rateType: RateType;
  lines: RevalLine[];
  skipped: { invoiceNumber: string; currency: string; reason: string }[];
  totalGain: string; posted: { voucherNumber: string } | null;
}

const RATE_TYPES_R = Object.keys(RATE_TYPE_LABEL) as RateType[];
const money = (v: string, c: string) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

function RevaluationPanel() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1)); // 1-12
  const [rateType, setRateType] = useState<RateType>("AVERAGE");
  const [result, setResult] = useState<RevalResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(post: boolean) {
    setBusy(true);
    try {
      const res = await apiFetch<RevalResult>("/api/fx/revalue", {
        method: "POST",
        body: JSON.stringify({ year: Number(year), month: Number(month), rateType, post }),
      });
      setResult(res);
      if (post && res.posted) {
        toast({ title: `Posted — voucher ${res.posted.voucherNumber}`, variant: "success" });
      } else if (post && !res.posted) {
        toast({ title: "Nothing to post (no net exposure)", variant: "default" });
      } else {
        toast({ title: "Preview ready", variant: "default" });
      }
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const net = result ? parseFloat(result.totalGain) : 0;
  const alreadyPosted = !!result?.posted;

  return (
    <div className="rounded-xl border border-border bg-card/50 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Scale className="h-4 w-4 text-primary" /> Period-End Revaluation
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Restate open foreign-currency AP/AR to the period-end rate and book the unrealized FX gain/loss.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Year</Label><Input className="w-24" type="number" value={year} onChange={(e) => { setYear(e.target.value); setResult(null); }} /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Month</Label><Input className="w-20" type="number" min={1} max={12} value={month} onChange={(e) => { setMonth(e.target.value); setResult(null); }} /></div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rate Type</Label>
            <Select value={rateType} onValueChange={(v) => { setRateType(v as RateType); setResult(null); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{RATE_TYPES_R.map((t) => <SelectItem key={t} value={t}>{RATE_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => run(false)} disabled={busy}>Preview</Button>
        </div>
      </div>

      {result && (
        <>
          {result.lines.length === 0 && result.skipped.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No open foreign-currency balances for {result.asOf}. Nothing to revalue.</p>
          ) : (
            <>
              {result.lines.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Invoice</th>
                        <th className="px-3 py-2 font-medium">Ccy</th>
                        <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                        <th className="px-3 py-2 text-right font-medium">Booking→Period</th>
                        <th className="px-3 py-2 text-right font-medium">Base Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.lines.map((l, i) => {
                        const d = parseFloat(l.delta);
                        return (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-3 py-2"><Badge variant="outline">{l.kind}</Badge></td>
                            <td className="px-3 py-2 font-mono text-xs">{l.invoiceNumber}</td>
                            <td className="px-3 py-2">{l.currency}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{l.outstanding}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{l.bookingRate} → {l.periodRate}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-medium ${d >= 0 ? "text-emerald-500" : "text-destructive"}`}>{d >= 0 ? "+" : ""}{l.delta}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {result.skipped.length > 0 && (
                <p className="mt-2 text-xs text-amber-500">
                  {result.skipped.length} balance(s) skipped (no rate configured): {result.skipped.map((s) => s.invoiceNumber).join(", ")}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Net unrealized {net >= 0 ? "gain" : "loss"} · {result.asOf}</span>
                  <div className={`text-lg font-bold tabular-nums ${net >= 0 ? "text-emerald-500" : "text-destructive"}`}>{money(result.totalGain, result.baseCurrency)}</div>
                </div>
                {alreadyPosted ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-emerald-500"><CheckCircle2 className="h-4 w-4" /> Posted — voucher {result.posted!.voucherNumber}</span>
                ) : (
                  <Button onClick={() => run(true)} disabled={busy || net === 0}>Post adjusting entry</Button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
