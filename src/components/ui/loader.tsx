import { cn } from "@/lib/utils";

/**
 * FleetFlow branded loader — a route/orbit mark: a static hub with an orbiting
 * indigo arc and an expanding pulse ring. Distinct from a generic spinner and
 * on-theme for a logistics "in transit" feel.
 */
export function Loader({
  size = 40,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* expanding pulse ring */}
        <span
          className="absolute inset-0 rounded-full border border-primary/40"
          style={{ animation: "ff-pulse-ring 1.6s ease-out infinite" }}
        />
        {/* orbiting arc */}
        <span
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/60"
          style={{ animation: "ff-orbit 0.9s linear infinite" }}
        />
        {/* inner hub */}
        <span className="absolute inset-[30%] rounded-full bg-primary/90 shadow-[0_0_12px_hsl(var(--primary)/0.7)]" />
      </div>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}

/** Compact inline spinner (buttons, rows) sharing the orbit motion. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 rounded-full border-2 border-transparent border-t-current border-r-current/60",
        className,
      )}
      style={{ animation: "ff-orbit 0.7s linear infinite" }}
    />
  );
}

/** Equalizer-style three-bar pulse — used in the table loading row. */
export function PulseBars({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-end gap-1", className)}>
      {[0, 0.15, 0.3].map((d) => (
        <span
          key={d}
          className="w-1 origin-bottom rounded-full bg-primary"
          style={{ height: 14, animation: `ff-bar 1s ease-in-out ${d}s infinite` }}
        />
      ))}
    </span>
  );
}

/** Skeleton block — shimmering placeholder. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

/** A full-page centered loader for route loading.tsx. */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader size={48} label={label} />
    </div>
  );
}

/** A skeleton table for list-route loading states. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex gap-4 border-b border-border bg-elevated/50 px-4 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 border-b border-border px-4 py-3.5 last:border-0">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
