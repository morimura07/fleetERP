import { PageHeader } from "@frontend/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Badge } from "@frontend/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@frontend/components/ui/table";
import { Inbox } from "lucide-react";
import { serverApi } from "@frontend/lib/server-api";
import type { AgingReport } from "@frontend/lib/api-types";

export const metadata = { title: "Collections | FleetFlow" };
export const dynamic = "force-dynamic";

const BUCKETS = [
  { key: "current", label: "Current", tint: "text-emerald-400 bg-emerald-400/10", variant: "success" as const },
  { key: "d1_30", label: "1–30 days", tint: "text-sky-400 bg-sky-400/10", variant: "info" as const },
  { key: "d31_60", label: "31–60 days", tint: "text-amber-400 bg-amber-400/10", variant: "warning" as const },
  { key: "d61_90", label: "61–90 days", tint: "text-orange-400 bg-orange-400/10", variant: "warning" as const },
  { key: "d90_plus", label: "90+ days", tint: "text-red-400 bg-red-400/10", variant: "destructive" as const },
] as const;

export default async function CollectionsPage() {
  const report = await serverApi<AgingReport>("/api/collections");
  const cur = report.customers[0]?.currency ?? "USD";
  const money = (v: string) => `${cur} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Credit & Collections" subtitle={`Accounts-receivable aging as of ${report.asOf}.`} />

      {/* Aging bucket summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {BUCKETS.map((b) => (
          <Card key={b.key}>
            <CardContent className="p-5">
              <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${b.tint}`}>
                <span className="text-xs font-bold">{b.label.split(" ")[0]}</span>
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.label}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{money(report.totals[b.key])}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Outstanding by Customer</CardTitle>
          <span className="text-sm text-muted-foreground">Total outstanding: <span className="font-semibold text-foreground">{money(report.totals.total)}</span></span>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-wider">Customer</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider">Current</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider">1–30</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider">31–60</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider">61–90</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider">90+</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.customers.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Inbox className="h-7 w-7 opacity-40" />
                      <span className="text-sm">No outstanding receivables</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                report.customers.map((c) => {
                  const overdue = parseFloat(c.d90_plus) > 0;
                  return (
                    <TableRow key={c.customerId}>
                      <TableCell>
                        <div className="font-medium">{c.customerName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{c.customerCode}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{parseFloat(c.current).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{parseFloat(c.d1_30).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{parseFloat(c.d31_60).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{parseFloat(c.d61_90).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {overdue ? <span className="font-semibold text-red-400">{parseFloat(c.d90_plus).toLocaleString()}</span> : parseFloat(c.d90_plus).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{parseFloat(c.total).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
