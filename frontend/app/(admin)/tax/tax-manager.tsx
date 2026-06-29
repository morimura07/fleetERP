"use client";
import { useCallback, useEffect, useState } from "react";
import { Receipt, ArrowDownToLine, ArrowUpFromLine, Scale, Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/ui/loader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/fetcher";
import type { LucideIcon } from "lucide-react";

interface TaxReturn {
  year: number; month: number; currency: string;
  outputVat: string; inputVat: string; netVat: string; netVatLabel: string;
  whtPayable: string; customerInvoiceCount: number; vendorInvoiceCount: number;
  taxableSales: string; taxablePurchases: string;
}
interface TaxComponent { code: string; country: string; name: string; rate: number; kind: string; }

const fmt = (cur: string, v: string) => `${cur} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

function SummaryCard({ title, value, icon: Icon, tile }: { title: string; value: string; icon: LucideIcon; tile: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tile}`}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-0.5 truncate text-2xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function TaxManager() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [ret, setRet] = useState<TaxReturn | null>(null);
  const [components, setComponents] = useState<TaxComponent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ return: TaxReturn; components: TaxComponent[] }>(`/api/tax?year=${year}&month=${month}`);
      setRet(data.return);
      setComponents(data.components);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const netVariant = ret?.netVatLabel === "Payable" ? "warning" : ret?.netVatLabel === "Reclaimable" ? "success" : "secondary";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Filing Period</CardTitle>
            <p className="text-sm text-muted-foreground">VAT &amp; WHT computed from posted invoices in the month</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" className="w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            <Input type="number" className="w-20" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} />
          </div>
        </CardHeader>
        <CardContent>
          {loading || !ret ? (
            <Loader size={36} label="Computing return…" />
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard title="Output VAT" value={fmt(ret.currency, ret.outputVat)} icon={ArrowUpFromLine} tile="text-sky-400 bg-sky-400/10" />
                <SummaryCard title="Input VAT" value={fmt(ret.currency, ret.inputVat)} icon={ArrowDownToLine} tile="text-cyan-400 bg-cyan-400/10" />
                <SummaryCard title="Net VAT" value={fmt(ret.currency, ret.netVat)} icon={Scale} tile="text-violet-400 bg-violet-400/10" />
                <SummaryCard title="WHT Payable" value={fmt(ret.currency, ret.whtPayable)} icon={Landmark} tile="text-amber-400 bg-amber-400/10" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Net VAT position</span>
                    <Badge variant={netVariant}>{ret.netVatLabel}</Badge>
                  </div>
                  <p className="mt-2 text-3xl font-bold tabular-nums">{fmt(ret.currency, ret.netVat)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Output VAT − Input VAT (positive = owed to the authority)</p>
                </div>
                <div className="rounded-xl border border-border p-5">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-muted-foreground">Taxable Sales</p><p className="font-semibold tabular-nums">{fmt(ret.currency, ret.taxableSales)}</p><p className="text-xs text-muted-foreground">{ret.customerInvoiceCount} invoices</p></div>
                    <div><p className="text-muted-foreground">Taxable Purchases</p><p className="font-semibold tabular-nums">{fmt(ret.currency, ret.taxablePurchases)}</p><p className="text-xs text-muted-foreground">{ret.vendorInvoiceCount} bills</p></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tax Component Reference</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-wider">Code</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">Country</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">Type</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.map((c) => (
                <TableRow key={c.code}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell>{c.country}</TableCell>
                  <TableCell><Badge variant="outline"><Receipt className="mr-1 h-3 w-3" />{c.name}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{c.rate.toFixed(2)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
