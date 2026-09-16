"use client";
import { useCallback, useEffect, useState } from "react";
import { DownloadButton } from "@frontend/components/data/download-button";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@frontend/components/ui/table";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch } from "@frontend/lib/fetcher";
import { formatYen } from "@frontend/lib/utils";

interface Row { driverId: string; driverName: string; jobCount: number; totalAmount: number; }

export default function PaymentsPage() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const data = await apiFetch<{ rows: Row[]; total: number }>(`/api/payments?year=${year}&month=${month}`);
    setRows(data.rows); setTotal(data.total);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  async function finalize() {
    await apiFetch(`/api/payments?year=${year}&month=${month}`, { method: "POST" });
    toast({ title: "Payments finalized", variant: "success" });
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Monthly Summary</CardTitle>
          <div className="flex items-center gap-2">
            <Input type="number" className="w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            <Input type="number" className="w-20" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} />
            <DownloadButton variant="outline" path={`/api/exports/payment-pdf?year=${year}&month=${month}`} fileName={`payments-${year}-${String(month).padStart(2, "0")}.pdf`}>PDF</DownloadButton>
            <Button onClick={finalize}>Finalize</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Driver</TableHead><TableHead>Jobs</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">No data</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.driverId}>
                  <TableCell>{r.driverName}</TableCell>
                  <TableCell>{r.jobCount}</TableCell>
                  <TableCell className="text-right font-medium">{formatYen(r.totalAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 text-right text-lg font-bold">Total: {formatYen(total)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
