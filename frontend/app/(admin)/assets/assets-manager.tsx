"use client";
import { useEffect, useState } from "react";
import { Plus, CalendarClock, PackageX, BookText } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { ASSET_CATEGORY_LABEL, ASSET_STATUS_LABEL, ASSET_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { AssetCategory, AssetStatus } from "@frontend/lib/enums";

interface AssetRow {
  id: string; code: string; name: string; category: AssetCategory; status: AssetStatus;
  acquisitionCost: string; accumulatedDepreciation: string; bookValue: string;
}

const money = (v: string) => `USD ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

type AssetForm = {
  code: string; name: string; category: AssetCategory;
  acquisitionCost: string; residualValue: string; usefulLifeMonths: string;
  acquisitionDate: string; inServiceDate: string;
};
const emptyForm = (): AssetForm => ({
  code: "", name: "", category: "EQUIPMENT",
  acquisitionCost: "", residualValue: "0", usefulLifeMonths: "60",
  acquisitionDate: today(), inServiceDate: today(),
});

export function AssetsManager() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [form, setForm] = useState<AssetForm>(emptyForm());
  const [period, setPeriod] = useState(thisMonth());
  const [busy, setBusy] = useState(false);

  function setF(patch: Partial<AssetForm>) { setForm((f) => ({ ...f, ...patch })); }
  const refresh = () => setRefreshKey((k) => k + 1);

  async function createAsset() {
    setBusy(true);
    try {
      if (!form.code.trim()) throw new ApiError("Asset tag is required", 422);
      if (!form.name.trim()) throw new ApiError("Name is required", 422);
      await apiFetch("/api/assets", {
        method: "POST",
        body: JSON.stringify({
          code: form.code, name: form.name, category: form.category,
          acquisitionCost: Number(form.acquisitionCost), residualValue: Number(form.residualValue),
          usefulLifeMonths: Number(form.usefulLifeMonths),
          acquisitionDate: form.acquisitionDate, inServiceDate: form.inServiceDate,
        }),
      });
      toast({ title: "Asset registered", variant: "success" });
      setCreateOpen(false); setForm(emptyForm()); refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function runDepreciation() {
    setBusy(true);
    try {
      const res = await apiFetch<{ charged: unknown[]; skipped: unknown[]; totalCharged: string }>(
        "/api/assets/depreciation/run", { method: "POST", body: JSON.stringify({ period }) },
      );
      toast({
        title: `Depreciation ${period} run`,
        description: `${res.charged.length} charged (${money(res.totalCharged)}), ${res.skipped.length} skipped`,
        variant: "success",
      });
      setRunOpen(false); refresh();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const monthlyPreview = (() => {
    const base = Number(form.acquisitionCost) - Number(form.residualValue);
    const months = Number(form.usefulLifeMonths);
    if (!(base > 0) || !(months > 0)) return null;
    return (base / months).toFixed(2);
  })();

  const columns: Column<AssetRow>[] = [
    { key: "code", header: "Tag", render: (r) => <span className="font-mono">{r.code}</span> },
    { key: "name", header: "Asset" },
    { key: "category", header: "Category", render: (r) => ASSET_CATEGORY_LABEL[r.category] },
    { key: "acquisitionCost", header: "Cost", render: (r) => <span className="tabular-nums">{money(r.acquisitionCost)}</span> },
    { key: "accumulatedDepreciation", header: "Accum. Dep.", render: (r) => <span className="tabular-nums text-muted-foreground">{money(r.accumulatedDepreciation)}</span> },
    { key: "bookValue", header: "Book Value", render: (r) => <span className="tabular-nums font-medium">{money(r.bookValue)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={ASSET_STATUS_VARIANT[r.status]}>{ASSET_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<AssetRow>
        endpoint="/api/assets"
        columns={columns}
        searchPlaceholder="Search by tag or name"
        refreshKey={refreshKey}
        toolbar={
          <>
            <Button variant="outline" onClick={() => { setPeriod(thisMonth()); setRunOpen(true); }}>
              <CalendarClock className="h-4 w-4" />Run Depreciation
            </Button>
            <Button onClick={() => { setForm(emptyForm()); setCreateOpen(true); }}><Plus className="h-4 w-4" />New Asset</Button>
          </>
        }
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>Open</Button>}
      />

      {/* Register asset */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Register Fixed Asset</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Asset tag</Label><Input placeholder="FA-0001" value={form.code} onChange={(e) => setF({ code: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setF({ category: v as AssetCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ASSET_CATEGORY_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2"><Label>Name</Label><Input placeholder="Isuzu FRR flatbed truck" value={form.name} onChange={(e) => setF({ name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Acquisition cost (USD)</Label><Input type="number" step="0.01" value={form.acquisitionCost} onChange={(e) => setF({ acquisitionCost: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Residual value (USD)</Label><Input type="number" step="0.01" value={form.residualValue} onChange={(e) => setF({ residualValue: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Useful life (months)</Label><Input type="number" value={form.usefulLifeMonths} onChange={(e) => setF({ usefulLifeMonths: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Acquisition date</Label><Input type="date" value={form.acquisitionDate} onChange={(e) => setF({ acquisitionDate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>In-service date</Label><Input type="date" value={form.inServiceDate} onChange={(e) => setF({ inServiceDate: e.target.value })} /></div>
            {monthlyPreview && (
              <p className="md:col-span-2 text-sm text-muted-foreground">
                Straight-line monthly depreciation: <span className="font-semibold text-foreground tabular-nums">{money(monthlyPreview)}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createAsset} disabled={busy}>Register</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run depreciation */}
      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Run Depreciation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Charges one month of straight-line depreciation to every active asset in the current company, posting Dr Depreciation Expense / Cr Accumulated Depreciation. Safe to re-run — assets already depreciated for the period are skipped.
            </p>
            <div className="space-y-1.5"><Label>Period</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunOpen(false)}>Cancel</Button>
            <Button onClick={runDepreciation} disabled={busy}><BookText className="h-4 w-4" />Post depreciation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailId && <AssetDetail id={detailId} onClose={() => setDetailId(null)} onChange={refresh} />}
    </>
  );
}

type AssetDetailData = {
  id: string; code: string; name: string; category: AssetCategory; status: AssetStatus;
  acquisitionCost: string; residualValue: string; usefulLifeMonths: number;
  accumulatedDepreciation: string; bookValue: string;
  acquisitionDate: string; inServiceDate: string;
  disposalDate: string | null; disposalProceeds: string | null;
  disposalEntry: { voucherNumber: string } | null;
  entries: { id: string; period: string; amount: string; bookValueAfter: string; journalEntry: { voucherNumber: string } | null }[];
};

function AssetDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [asset, setAsset] = useState<AssetDetailData | null>(null);
  const [busy, setBusy] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [proceeds, setProceeds] = useState("0");
  const [disposalDate, setDisposalDate] = useState(today());

  async function load() {
    try { setAsset(await apiFetch<AssetDetailData>(`/api/assets/${id}`)); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function dispose() {
    setBusy(true);
    try {
      await apiFetch(`/api/assets/${id}/dispose`, {
        method: "POST",
        body: JSON.stringify({ proceeds: Number(proceeds), disposalDate }),
      });
      toast({ title: "Asset disposed", variant: "success" });
      setDisposeOpen(false); onChange(); await load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const gainLoss = asset ? Number(proceeds) - Number(asset.bookValue) : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{asset ? `${asset.code} — ${asset.name}` : "Loading…"}</DialogTitle></DialogHeader>
        {asset && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={ASSET_STATUS_VARIANT[asset.status]}>{ASSET_STATUS_LABEL[asset.status]}</Badge>
              <span className="text-muted-foreground">{ASSET_CATEGORY_LABEL[asset.category]}</span>
              <span className="text-muted-foreground">Cost: <span className="font-medium text-foreground tabular-nums">{money(asset.acquisitionCost)}</span></span>
              <span className="text-muted-foreground">Accum: <span className="tabular-nums">{money(asset.accumulatedDepreciation)}</span></span>
              <span className="ml-auto font-semibold tabular-nums">Book value: {money(asset.bookValue)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-4">
              <div>Residual<div className="text-foreground tabular-nums">{money(asset.residualValue)}</div></div>
              <div>Useful life<div className="text-foreground">{asset.usefulLifeMonths} mo</div></div>
              <div>Acquired<div className="text-foreground">{asset.acquisitionDate.slice(0, 10)}</div></div>
              <div>In service<div className="text-foreground">{asset.inServiceDate.slice(0, 10)}</div></div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Depreciation schedule</div>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-elevated/80 text-[11px] uppercase text-muted-foreground">
                    <tr><th className="p-2 text-left">Period</th><th className="p-2 text-right">Charge</th><th className="p-2 text-right">Book value</th><th className="p-2 text-left">Voucher</th></tr>
                  </thead>
                  <tbody>
                    {asset.entries.length === 0 && <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No depreciation posted yet.</td></tr>}
                    {asset.entries.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="p-2 font-mono text-xs">{e.period}</td>
                        <td className="p-2 text-right tabular-nums">{money(e.amount)}</td>
                        <td className="p-2 text-right tabular-nums">{money(e.bookValueAfter)}</td>
                        <td className="p-2 font-mono text-xs text-muted-foreground">{e.journalEntry?.voucherNumber ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {asset.status === "DISPOSED" && (
              <p className="text-sm text-muted-foreground">
                Disposed {asset.disposalDate?.slice(0, 10)} for {money(asset.disposalProceeds ?? "0")} · voucher{" "}
                <span className="font-mono text-xs">{asset.disposalEntry?.voucherNumber ?? "—"}</span>
              </p>
            )}

            <DialogFooter className="gap-2">
              {asset.status !== "DISPOSED" && (
                <Button variant="outline" disabled={busy} onClick={() => { setProceeds("0"); setDisposalDate(today()); setDisposeOpen(true); }}>
                  <PackageX className="h-4 w-4" />Dispose
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>

      {/* Dispose sub-dialog */}
      {asset && (
        <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Dispose {asset.code}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Writes off net book value ({money(asset.bookValue)}) and books the proceeds. Gain or loss posts to the ledger.
              </p>
              <div className="space-y-1.5"><Label>Proceeds (USD)</Label><Input type="number" step="0.01" value={proceeds} onChange={(e) => setProceeds(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Disposal date</Label><Input type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} /></div>
              <p className="text-sm">
                {gainLoss >= 0
                  ? <span className="text-emerald-400">Gain on disposal: {money(String(gainLoss))}</span>
                  : <span className="text-amber-400">Loss on disposal: {money(String(Math.abs(gainLoss)))}</span>}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDisposeOpen(false)}>Cancel</Button>
              <Button onClick={dispose} disabled={busy}>Confirm disposal</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
