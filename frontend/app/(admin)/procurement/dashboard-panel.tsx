"use client";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, describeError } from "@frontend/lib/fetcher";

interface Kpis {
  turnaround: { orders: number; averageDays: number | null; withinSlaPct: number | null; slaDays: number };
  onTimeDelivery: { orders: number; pct: number | null };
  savings: { orders: number; initial: string; final: string; saved: string; pct: number | null };
  pipeline: { requisitionsOpen: number; rfqsOpen: number; posPendingApproval: number; posOpen: number; invoicesOnHold: number };
  spendByVendor: { vendorCode: string; vendorName: string; orders: number; spend: string }[];
}
interface Card { vendorId: string; vendorCode: string; vendorName: string; orders: number; onTimeDeliveryPct: number | null; qualityPassPct: number | null; priceVariancePct: number | null; rfqResponsePct: number | null; returns: number; spend: string; currency: string; score: number | null; rating: string | null }

const q = () => { const d = new Date(); return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; };
const fmt = (n: number | null, suffix = "") => (n == null ? "-" : `${n}${suffix}`);

/** The executive figures and the quarterly vendor scorecard (client requirements, Procurement §6). */
export function DashboardPanel() {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);
  const [from, setFrom] = useState(new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [quarter, setQuarter] = useState(q());
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => { apiFetch<Kpis>(`/api/procurement/kpis/summary?from=${from}&to=${to}`).then(setKpis).catch(fail); }, [from, to, fail]);
  useEffect(() => { if (/^\d{4}-Q[1-4]$/.test(quarter)) apiFetch<Card[]>(`/api/procurement/scorecards/${quarter}`).then(setCards).catch(fail); }, [quarter, fail]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label className="text-xs">From</Label><Input className="h-9" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">To</Label><Input className="h-9" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {kpis && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="PO turnaround" value={fmt(kpis.turnaround.averageDays, " days")} hint={`${fmt(kpis.turnaround.withinSlaPct, "%")} within the ${kpis.turnaround.slaDays}-day SLA · ${kpis.turnaround.orders} orders`} tone={kpis.turnaround.withinSlaPct != null && kpis.turnaround.withinSlaPct < 80 ? "warn" : undefined} />
          <Tile label="On-time delivery" value={fmt(kpis.onTimeDelivery.pct, "%")} hint={`${kpis.onTimeDelivery.orders} orders with a date and a receipt`} tone={kpis.onTimeDelivery.pct != null && kpis.onTimeDelivery.pct < 80 ? "warn" : undefined} />
          <Tile label="Cost savings" value={`${Number(kpis.savings.saved).toLocaleString()} (${fmt(kpis.savings.pct, "%")})`} hint={`${kpis.savings.orders} sourced orders · first quotes ${Number(kpis.savings.initial).toLocaleString()}`} />
          <Tile label="Pipeline" value={`${kpis.pipeline.posPendingApproval} awaiting approval`} hint={`${kpis.pipeline.requisitionsOpen} requisitions · ${kpis.pipeline.rfqsOpen} RFQs · ${kpis.pipeline.posOpen} open orders · ${kpis.pipeline.invoicesOnHold} bills on hold`} tone={kpis.pipeline.invoicesOnHold > 0 ? "warn" : undefined} />
        </div>
      )}
      {kpis && kpis.spendByVendor.length > 0 && (
        <div className="rounded-md border">
          <div className="border-b px-3 py-1.5 text-xs font-medium uppercase text-muted-foreground">Spend by vendor</div>
          <table className="w-full text-sm"><tbody className="tabular-nums">{kpis.spendByVendor.map((v) => <tr key={v.vendorCode} className="border-t"><td className="p-2 font-mono">{v.vendorCode}</td><td className="p-2">{v.vendorName}</td><td className="p-2 text-right">{v.orders} orders</td><td className="p-2 text-right">{Number(v.spend).toLocaleString()}</td></tr>)}</tbody></table>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label className="text-xs">Scorecard quarter</Label><Input className="h-9 w-32" value={quarter} onChange={(e) => setQuarter(e.target.value.toUpperCase())} placeholder="2026-Q3" /></div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-elevated/80 text-[11px] uppercase text-muted-foreground"><tr><th className="p-2 text-left">Vendor</th><th className="p-2 text-right">Orders</th><th className="p-2 text-right">Spend</th><th className="p-2 text-right">On time</th><th className="p-2 text-right">Quality</th><th className="p-2 text-right">Price var.</th><th className="p-2 text-right">RFQ response</th><th className="p-2 text-right">Returns</th><th className="p-2 text-right">Score</th><th className="p-2 text-left">Rating</th></tr></thead>
          <tbody className="tabular-nums">
            {(!cards || cards.length === 0) && <tr><td colSpan={10} className="p-3 text-center text-muted-foreground">No orders in {quarter}.</td></tr>}
            {cards?.map((c) => (
              <tr key={c.vendorId} className="border-t">
                <td className="p-2"><span className="font-mono">{c.vendorCode}</span> <span className="text-muted-foreground">{c.vendorName}</span></td>
                <td className="p-2 text-right">{c.orders}</td>
                <td className="p-2 text-right">{c.currency} {Number(c.spend).toLocaleString()}</td>
                <td className="p-2 text-right">{fmt(c.onTimeDeliveryPct, "%")}</td>
                <td className="p-2 text-right">{fmt(c.qualityPassPct, "%")}</td>
                <td className="p-2 text-right">{fmt(c.priceVariancePct, "%")}</td>
                <td className="p-2 text-right">{fmt(c.rfqResponsePct, "%")}</td>
                <td className="p-2 text-right">{c.returns}</td>
                <td className="p-2 text-right font-semibold">{fmt(c.score)}</td>
                <td className="p-2">{c.rating && <Badge variant={c.rating === "A" ? "success" : c.rating === "B" ? "info" : c.rating === "C" ? "warning" : "destructive"}>{c.rating}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Score: on-time delivery 40, quality pass rate 40, price variance 20. A from 90, B from 75, C from 60, otherwise D. Derived from the orders, never typed in.</p>
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
