"use client";
import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { CORRIDOR_LABEL, TRIP_EXPENSE_LABEL } from "@frontend/lib/labels";
import { apiFetch } from "@frontend/lib/fetcher";
import type { CorridorType, TripExpenseType } from "@frontend/lib/enums";

interface CorridorOrderRow {
  orderId: string; orderCode: string; client: string; route: string; bookingDate: string;
  tripCount: number; revenue: string; cost: string; profit: string; marginPct: string;
}
interface CorridorDetail {
  corridor: CorridorType;
  currency: string;
  orders: CorridorOrderRow[];
  expenseByType: { type: TripExpenseType; amount: string; share: number }[];
  baseCosts: { driverWages: string; tollPermits: string; misc: string };
  totals: { revenue: string; cost: string; profit: string; marginPct: string };
}

interface Row {
  corridor: CorridorType;
  orderCount: number;
  revenue: string;
  cost: string;
  profit: string;
  marginPct: string;
}
export interface CorridorPnLResponse {
  currency: string;
  rows: Row[];
  total: Omit<Row, "corridor">;
}

const money = (v: string, c: string) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const toneClass = (v: number) => (v >= 0 ? "text-emerald-500" : "text-destructive");

export function CorridorPnL({ data }: { data: CorridorPnLResponse }) {
  const { currency, rows, total } = data;
  const [openCorridor, setOpenCorridor] = useState<CorridorType | null>(null);
  const [detail, setDetail] = useState<CorridorDetail | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle(corridor: CorridorType) {
    if (openCorridor === corridor) { setOpenCorridor(null); setDetail(null); return; }
    setOpenCorridor(corridor);
    setDetail(null);
    setLoading(true);
    try {
      setDetail(await apiFetch<CorridorDetail>(`/api/dashboard/corridor-profitability/${corridor}`));
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
        No orders yet — corridor profitability appears once orders are booked.
      </div>
    );
  }

  // Scale the margin bars against the widest absolute margin so they're comparable.
  const maxMargin = Math.max(1, ...rows.map((r) => Math.abs(parseFloat(r.marginPct))));

  return (
    <div className="space-y-6">
      {/* Total summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Total Revenue" value={money(total.revenue, currency)} />
        <Metric label="Total Cost" value={money(total.cost, currency)} />
        <Metric label="Total Profit" value={money(total.profit, currency)} tone={parseFloat(total.profit)} />
        <Metric label="Overall Margin" value={`${total.marginPct}%`} tone={parseFloat(total.marginPct)} />
      </div>

      {/* Per-corridor table with margin bars */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Corridor</th>
              <th className="px-4 py-2.5 text-right font-medium">Orders</th>
              <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
              <th className="px-4 py-2.5 text-right font-medium">Cost</th>
              <th className="px-4 py-2.5 text-right font-medium">Profit</th>
              <th className="px-4 py-2.5 font-medium">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const margin = parseFloat(r.marginPct);
              return (
                <tr
                  key={r.corridor}
                  onClick={() => toggle(r.corridor)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-elevated"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <span className="flex items-center gap-1.5">
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${openCorridor === r.corridor ? "rotate-90" : ""}`} />
                      {CORRIDOR_LABEL[r.corridor]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.orderCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(r.revenue, currency)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(r.cost, currency)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${toneClass(parseFloat(r.profit))}`}>{money(r.profit, currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${margin >= 0 ? "bg-emerald-500" : "bg-destructive"}`}
                          style={{ width: `${Math.min(100, (Math.abs(margin) / maxMargin) * 100)}%` }}
                        />
                      </div>
                      <span className={`w-14 text-right tabular-nums text-xs ${toneClass(margin)}`}>{r.marginPct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right tabular-nums">{total.orderCount}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(total.revenue, currency)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(total.cost, currency)}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${toneClass(parseFloat(total.profit))}`}>{money(total.profit, currency)}</td>
              <td className={`px-4 py-3 tabular-nums ${toneClass(parseFloat(total.marginPct))}`}>{total.marginPct}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Drill-down: the costing and expenses behind one corridor. */}
      {openCorridor && (
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {CORRIDOR_LABEL[openCorridor]}
            <span className="font-normal text-muted-foreground"> — costing and expenses</span>
          </h2>

          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading corridor detail…
            </div>
          )}

          {detail && !loading && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Revenue" value={money(detail.totals.revenue, detail.currency)} />
                <Metric label="Cost" value={money(detail.totals.cost, detail.currency)} />
                <Metric label="Profit" value={money(detail.totals.profit, detail.currency)} tone={parseFloat(detail.totals.profit)} />
                <Metric label="Margin" value={`${detail.totals.marginPct}%`} tone={parseFloat(detail.totals.marginPct)} />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {/* Logged trip expenses, largest first */}
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Expenses by type</h3>
                  {detail.expenseByType.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No trip expenses logged on this corridor yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.expenseByType.map((e) => (
                        <div key={e.type} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span>{TRIP_EXPENSE_LABEL[e.type] ?? e.type}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {money(e.amount, detail.currency)} · {e.share}%
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary/70" style={{ width: `${e.share}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Base trip costs are not expense rows, so they would otherwise
                    be invisible and the breakdown would not reconcile. */}
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Base trip costs</h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Driver wages</span><span className="tabular-nums">{money(detail.baseCosts.driverWages, detail.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tolls &amp; permits</span><span className="tabular-nums">{money(detail.baseCosts.tollPermits, detail.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Miscellaneous</span><span className="tabular-nums">{money(detail.baseCosts.misc, detail.currency)}</span></div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Carried on the trip itself rather than logged as expenses. Both make up the cost figure above.
                  </p>
                </div>
              </div>

              {/* Order-level breakdown */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Order</th>
                      <th className="px-3 py-2 font-medium">Client</th>
                      <th className="px-3 py-2 font-medium">Route</th>
                      <th className="px-3 py-2 text-right font-medium">Trucks</th>
                      <th className="px-3 py-2 text-right font-medium">Revenue</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Profit</th>
                      <th className="px-3 py-2 text-right font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.orders.map((o) => (
                      <tr key={o.orderId} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{o.orderCode}</td>
                        <td className="px-3 py-2">{o.client || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{o.route}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{o.tripCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(o.revenue, detail.currency)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(o.cost, detail.currency)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${toneClass(parseFloat(o.profit))}`}>{money(o.profit, detail.currency)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums text-xs ${toneClass(parseFloat(o.marginPct))}`}>{o.marginPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone === undefined ? "text-foreground" : toneClass(tone);
  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
