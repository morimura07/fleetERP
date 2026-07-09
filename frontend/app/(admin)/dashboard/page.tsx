import {
  Package, Truck, Users, CheckCircle2, TrendingUp, Navigation,
  ClipboardList, FileText, Wallet, Gauge, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { serverApi } from "@frontend/lib/server-api";
import type { DashboardStats, ExecutiveStats, KpiDashboard } from "@frontend/lib/api-types";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Badge } from "@frontend/components/ui/badge";
import { PageHeader } from "@frontend/components/layout/page-header";
import { SplitGauge } from "@frontend/components/data/split-gauge";
import { formatYen } from "@frontend/lib/utils";

const usd = (v: string, currency = "USD") =>
  `${currency} ${Math.round(parseFloat(v)).toLocaleString()}`;

export const dynamic = "force-dynamic";

// tile = explicit "text-x bg-x/10" pair so the icon and its tile share a hue.
function StatCard({ title, value, icon: Icon, tile }: {
  title: string; value: string | number; icon: LucideIcon; tile: string;
}) {
  return (
    <Card className="group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tile}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-0.5 truncate text-2xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, unit, href, hint }: {
  label: string; value: string; unit?: string; href?: string; hint?: string;
}) {
  const body = (
    <Card className="group relative h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40">
      <CardContent className="p-5">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
        </p>
        {hint && <p className="mt-1.5 line-clamp-1 text-[11px] text-muted-foreground">{hint}</p>}
        {href && <span className="pointer-events-none absolute right-4 top-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">→</span>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl">{body}</Link> : body;
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pt-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
    </div>
  );
}

export default async function DashboardPage() {
  const [stats, exec, kpi] = await Promise.all([
    serverApi<DashboardStats>("/api/dashboard/stats"),
    serverApi<ExecutiveStats>("/api/dashboard/executive"),
    serverApi<KpiDashboard>("/api/dashboard/kpi"),
  ]);
  const maxRev = Math.max(...stats.monthlySeries.map((m) => m.revenue), 1);
  const profit = parseFloat(exec.tripProfit);

  return (
    <div className="space-y-7">
      <PageHeader title="Dashboard" subtitle="Today's performance at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Today's Jobs" value={stats.todayJobs} icon={Package} tile="text-sky-400 bg-sky-400/10" />
        <StatCard title="Delivering" value={stats.delivering} icon={Navigation} tile="text-amber-400 bg-amber-400/10" />
        <StatCard title="Completed Today" value={stats.completedToday} icon={CheckCircle2} tile="text-emerald-400 bg-emerald-400/10" />
        <StatCard title="Active Drivers" value={stats.activeDrivers} icon={Users} tile="text-indigo-400 bg-indigo-400/10" />
        <StatCard title="Available Vehicles" value={stats.availableVehicles} icon={Truck} tile="text-cyan-400 bg-cyan-400/10" />
        <StatCard title="Revenue This Month" value={formatYen(stats.revenueThisMonth)} icon={TrendingUp} tile="text-rose-400 bg-rose-400/10" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Summary</CardTitle>
          <p className="text-sm text-muted-foreground">Revenue and completed jobs over the last 6 months</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 sm:gap-6">
            {stats.monthlySeries.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-xs font-medium tabular-nums">{formatYen(m.revenue)}</div>
                <div className="flex h-44 w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-primary/40 to-primary transition-all duration-500 hover:from-primary/60 hover:to-violet-400"
                    style={{ height: `${Math.max((m.revenue / maxRev) * 100, 3)}%` }}
                    title={`${m.jobs} jobs`}
                  />
                </div>
                <div className="text-xs font-medium text-muted-foreground">{m.month}</div>
                <div className="text-[11px] text-muted-foreground">{m.jobs} jobs</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ───── Logistics KPIs, 5 categories (client dashboard spec) ───── */}
      <SectionTitle icon={Gauge}>Logistics KPIs</SectionTitle>
      <p className="-mt-3 text-sm text-muted-foreground">
        As of {kpi.asOf}. Click any tile to drill into the underlying records.
      </p>
      <div className="space-y-6">
        {kpi.categories.map((cat) => (
          <div key={cat.key} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat.title}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cat.tiles.map((t) => (
                <KpiCard key={t.key} label={t.label} value={t.value} unit={t.unit} href={t.href} hint={t.hint} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ───── Executive dashboard (PRD §8) ───── */}
      <SectionTitle icon={Gauge}>Executive — Operations &amp; Finance</SectionTitle>

      {/* §8.1 KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active / Total Vehicles" value={`${exec.activeVehicles} / ${exec.totalFleet}`} icon={Truck} tile="text-sky-400 bg-sky-400/10" />
        <StatCard title="Active / Total Drivers" value={`${exec.activeDrivers} / ${exec.totalDrivers}`} icon={Users} tile="text-indigo-400 bg-indigo-400/10" />
        <StatCard title="Asset Utilization" value={`${exec.assetUtilizationPct}%`} icon={Gauge} tile="text-amber-400 bg-amber-400/10" />
        <StatCard title="Total Bookings" value={exec.totalBookings} icon={ClipboardList} tile="text-cyan-400 bg-cyan-400/10" />
        <StatCard title="Total Booking Value" value={usd(exec.totalBookingValue, exec.currency)} icon={ClipboardList} tile="text-violet-400 bg-violet-400/10" />
        <StatCard title="Invoiced Revenue (A/R)" value={usd(exec.invoicedRevenue, exec.currency)} icon={FileText} tile="text-emerald-400 bg-emerald-400/10" />
        <StatCard title="Trip P&L" value={usd(exec.tripProfit, exec.currency)} icon={Wallet} tile={profit < 0 ? "text-rose-400 bg-rose-400/10" : "text-emerald-400 bg-emerald-400/10"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* §8.2 gauges */}
        <Card>
          <CardHeader><CardTitle>Financial Gauges</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              <SplitGauge
                label="Customer Payment Recovery"
                greenLabel="Invoiced" redLabel="Pending"
                green={parseFloat(exec.customerRecovery.invoiced)}
                red={parseFloat(exec.customerRecovery.pending)}
                currency={exec.currency}
              />
              <SplitGauge
                label="Supplier Obligations"
                greenLabel="Posted" redLabel="Unposted"
                green={parseFloat(exec.supplierObligations.posted)}
                red={parseFloat(exec.supplierObligations.unposted)}
                currency={exec.currency}
              />
            </div>
          </CardContent>
        </Card>

        {/* §8.3 compliance lifecycle */}
        <Card>
          <CardHeader>
            <CardTitle>Document Lifecycle</CardTitle>
            <p className="text-sm text-muted-foreground">Vehicle insurance &amp; inspection status</p>
          </CardHeader>
          <CardContent className="flex h-full flex-col justify-center">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                <div className="text-3xl font-bold tabular-nums text-emerald-400">{exec.compliance.current}</div>
                <Badge variant="success" className="mt-2">Current</Badge>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                <div className="text-3xl font-bold tabular-nums text-amber-400">{exec.compliance.expiringSoon}</div>
                <Badge variant="warning" className="mt-2">Expiring</Badge>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                <div className="text-3xl font-bold tabular-nums text-red-400">{exec.compliance.expired}</div>
                <Badge variant="destructive" className="mt-2">Expired</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
