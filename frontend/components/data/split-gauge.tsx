/**
 * Two-segment ratio gauge (PRD §8.2 "half-donut"): green = primary, red = the
 * remainder. Rendered with a CSS conic-gradient so there is no chart-lib
 * dependency. Server-component friendly (no client hooks).
 */
export function SplitGauge({
  label,
  greenLabel,
  redLabel,
  green,
  red,
  currency = "USD",
}: {
  label: string;
  greenLabel: string;
  redLabel: string;
  green: number;
  red: number;
  currency?: string;
}) {
  const total = green + red;
  const greenPct = total > 0 ? (green / total) * 100 : 0;
  const fmt = (n: number) => `${currency} ${Math.round(n).toLocaleString()}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div
        className="relative h-32 w-32 rounded-full"
        style={{
          background: `conic-gradient(#10b981 ${greenPct}%, #ef4444 0)`,
        }}
      >
        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-card">
          <div className="text-xl font-bold">{Math.round(greenPct)}%</div>
          <div className="text-[10px] text-muted-foreground">{greenLabel}</div>
        </div>
      </div>
      <div className="space-y-0.5 text-center text-xs">
        <div className="flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">{greenLabel}</span>
          <span className="font-medium">{fmt(green)}</span>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-muted-foreground">{redLabel}</span>
          <span className="font-medium">{fmt(red)}</span>
        </div>
      </div>
    </div>
  );
}
