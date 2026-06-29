"use client";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, AlertTriangle } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Loader } from "@frontend/components/ui/loader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@frontend/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { consolidationMapSchema, type ConsolidationMapInput } from "@frontend/lib/validations";
import { RATE_TYPE_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { RateType } from "@frontend/lib/enums";

interface ConsolLine {
  parentAccount: string; subsidiary: string; subAccount: string;
  currency: string; localBalance: string; rate: string | null; baseBalance: string;
}
interface ConsolResult {
  parentArea: string; baseCurrency: string; rateType: RateType; asOf: string;
  lines: ConsolLine[]; unmappedAccounts: string[]; missingRates: string[]; totalBase: string;
}
interface MapRow { id: string; subsidiary: string; subAccount: string; parentAccount: string; }

const RATE_TYPES = Object.keys(RATE_TYPE_LABEL) as RateType[];

export function ConsolidationManager() {
  const { toast } = useToast();
  const [rateType, setRateType] = useState<RateType>("AVERAGE");
  const [result, setResult] = useState<ConsolResult | null>(null);
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const form = useForm<ConsolidationMapInput>({ resolver: zodResolver(consolidationMapSchema) });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ result: ConsolResult; maps: MapRow[] }>(`/api/consolidation?rateType=${rateType}`);
      setResult(data.result);
      setMaps(data.maps);
    } finally {
      setLoading(false);
    }
  }, [rateType]);
  useEffect(() => { load(); }, [load]);

  function openCreate() {
    form.reset({ parentArea: "HQ01", subsidiary: "", subAccount: "", parentAccount: "" });
    setOpen(true);
  }
  async function onSubmit(data: ConsolidationMapInput) {
    try {
      await apiFetch("/api/consolidation", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Mapping added", variant: "success" });
      setOpen(false);
      load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  const fmt = (cur: string, v: string) => `${cur} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Consolidation Run</CardTitle>
            <p className="text-sm text-muted-foreground">Subsidiary balances translated into {result?.baseCurrency ?? "USD"} ({result?.parentArea ?? "HQ01"})</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Rate Type</Label>
            <Select value={rateType} onValueChange={(v) => setRateType(v as RateType)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{RATE_TYPES.map((t) => <SelectItem key={t} value={t}>{RATE_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading || !result ? (
            <Loader size={36} label="Running consolidation…" />
          ) : (
            <div className="space-y-4">
              {(result.missingRates.length > 0 || result.unmappedAccounts.length > 0) && (
                <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  {result.missingRates.length > 0 && (
                    <p className="flex items-center gap-2 text-amber-500"><AlertTriangle className="h-4 w-4" />No {rateType} rate for: {result.missingRates.join(", ")} (treated as 1:1)</p>
                  )}
                  {result.unmappedAccounts.length > 0 && (
                    <p className="flex items-center gap-2 text-amber-500"><AlertTriangle className="h-4 w-4" />Unmapped subsidiary accounts: {result.unmappedAccounts.join(", ")}</p>
                  )}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] uppercase tracking-wider">Parent Acct</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider">Subsidiary</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider">Sub Acct</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider">Local</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider">Rate</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider">Base</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.lines.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No mapped balances. Add mappings below.</TableCell></TableRow>
                  ) : result.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{l.parentAccount}</TableCell>
                      <TableCell>{l.subsidiary}</TableCell>
                      <TableCell className="font-mono">{l.subAccount}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(l.currency, l.localBalance)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.rate ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(result.baseCurrency, l.baseBalance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Total ({result.asOf}):&nbsp;</span>
                <span className="font-bold tabular-nums">{fmt(result.baseCurrency, result.totalBase)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Account Mapping</CardTitle>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" />Add Mapping</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase tracking-wider">Subsidiary</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">Sub Account</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider">Parent Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {maps.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No mappings yet.</TableCell></TableRow>
              ) : maps.map((m) => (
                <TableRow key={m.id}>
                  <TableCell><Badge variant="outline">{m.subsidiary}</Badge></TableCell>
                  <TableCell className="font-mono">{m.subAccount}</TableCell>
                  <TableCell className="font-mono">{m.parentAccount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Account Mapping</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Parent Entity</Label><Input maxLength={10} {...form.register("parentArea")} /></div>
              <div className="space-y-1.5">
                <Label>Subsidiary</Label>
                <Input placeholder="KE01" {...form.register("subsidiary")} />
                {form.formState.errors.subsidiary && <p className="text-xs text-destructive">{form.formState.errors.subsidiary.message}</p>}
              </div>
              <div className="space-y-1.5"><Label>Subsidiary Account</Label><Input placeholder="4000" {...form.register("subAccount")} /></div>
              <div className="space-y-1.5"><Label>Parent Account</Label><Input placeholder="4000" {...form.register("parentAccount")} /></div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
