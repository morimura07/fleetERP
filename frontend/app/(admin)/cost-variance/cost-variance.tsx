interface Row {
  code: string;
  name: string;
  currency: string;
  standardCost: string;
  avgCost: string;
  quantityOnHand: string;
  unitVariance: string;
  variancePct: string;
  varianceValue: string;
}
export interface CostVarianceReport {
  currency: string;
  rows: Row[];
  totals: { itemCount: number; onHandStandard: string; onHandActual: string; varianceValue: string };
  realizedPpv: string;
  receiptCount: number;
}

const money = (v: string, c: string) => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const num = (v: string, dp = 4) => parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
// Unfavorable (actual above standard) is red; favorable is green.
const varTone = (v: number) => (v > 0 ? "text-destructive" : v < 0 ? "text-emerald-500" : "text-muted-foreground");

export function CostVariance({ data }: { data: CostVarianceReport }) {
  const { currency, rows, totals, realizedPpv, receiptCount } = data;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
        No stock items have a standard cost set yet. Set a <span className="font-medium text-foreground">Standard Cost</span> on inventory items to track variance against actual.
      </div>
    );
  }

  const totalVar = parseFloat(totals.varianceValue);
  const ppv = parseFloat(realizedPpv);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="On-hand @ Standard" value={money(totals.onHandStandard, currency)} />
        <Metric label="On-hand @ Actual" value={money(totals.onHandActual, currency)} />
        <Metric label="On-hand Variance" value={money(totals.varianceValue, currency)} tone={totalVar} />
        <Metric label={`Realized PPV (${receiptCount} receipts)`} value={money(realizedPpv, currency)} tone={ppv} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Item</th>
              <th className="px-4 py-2.5 text-right font-medium">Std Cost</th>
              <th className="px-4 py-2.5 text-right font-medium">Avg Cost</th>
              <th className="px-4 py-2.5 text-right font-medium">Unit Var</th>
              <th className="px-4 py-2.5 text-right font-medium">Var %</th>
              <th className="px-4 py-2.5 text-right font-medium">On Hand</th>
              <th className="px-4 py-2.5 text-right font-medium">Variance Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const uv = parseFloat(r.unitVariance);
              const vv = parseFloat(r.varianceValue);
              return (
                <tr key={r.code} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{r.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{r.code}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(r.standardCost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(r.avgCost)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${varTone(uv)}`}>{uv >= 0 ? "+" : ""}{num(r.unitVariance)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${varTone(uv)}`}>{parseFloat(r.variancePct) >= 0 ? "+" : ""}{r.variancePct}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{num(r.quantityOnHand, 3)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${varTone(vv)}`}>{money(r.varianceValue, r.currency)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30 font-semibold">
              <td className="px-4 py-3">Total ({totals.itemCount} items)</td>
              <td colSpan={4} />
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(totals.onHandActual, currency)}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${varTone(totalVar)}`}>{money(totals.varianceValue, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone === undefined ? "text-foreground" : varTone(tone);
  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
