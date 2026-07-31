import { CORRIDOR_LABEL } from "@frontend/lib/labels";
import type { CorridorType } from "@frontend/lib/enums";

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
                <tr key={r.corridor} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{CORRIDOR_LABEL[r.corridor]}</td>
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
