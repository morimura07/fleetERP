"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, FlaskConical } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { RATE_TYPE_LABEL } from "@frontend/lib/labels";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import type { RateType } from "@frontend/lib/enums";
import { type Available, type EntityRow, type MapRow, type RunLine, TYPE_LABEL, amt, thisMonth } from "./shared";

/**
 * The account mapping and the subsidiaries (client requirements, Sept 2026,
 * Consolidation §3): rate type per account, intercompany flag, ownership
 * share, and Edit / Delete / Test on every row.
 */
export function MappingPanel({ parentArea, available, entities, maps, onChanged }: {
  parentArea: string; available: Available; entities: EntityRow[]; maps: MapRow[]; onChanged: () => void;
}) {
  const { toast } = useToast();
  const fail = (e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" });
  const [editing, setEditing] = useState<Partial<MapRow> | null>(null);
  const [testing, setTesting] = useState<MapRow | null>(null);
  const [entityEdit, setEntityEdit] = useState<Partial<EntityRow> | null>(null);
  const share = new Map(entities.map((e) => [e.subsidiary, e]));

  async function remove(m: MapRow) {
    try { await apiFetch(`/api/consolidation/maps/${m.id}`, { method: "DELETE" }); toast({ title: "Mapping removed", variant: "success" }); onChanged(); }
    catch (e) { fail(e); }
  }
  async function removeEntity(e: EntityRow) {
    try { await apiFetch(`/api/consolidation/entities/${e.id}`, { method: "DELETE" }); toast({ title: "Subsidiary removed", variant: "success" }); onChanged(); }
    catch (err) { fail(err); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Subsidiaries</CardTitle>
            <p className="text-xs text-muted-foreground">Ownership share applied on roll-up, and the equity account that carries the CTA.</p>
          </div>
          <Button size="sm" onClick={() => setEntityEdit({})}><Plus className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-1">
          {entities.length === 0 && <p className="text-sm text-muted-foreground">No subsidiaries yet.</p>}
          {entities.map((e) => {
            const co = available.companies.find((c) => c.code === e.subsidiary);
            return (
              <div key={e.id} className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-sm ${e.isActive ? "" : "opacity-50"}`}>
                <div>
                  <span className="font-mono">{e.subsidiary}</span> <span className="text-muted-foreground">{co?.name ?? ""} {co ? `(${co.baseCurrency})` : ""}</span>
                  <div className="text-xs text-muted-foreground">{Number(e.sharePct)}% · CTA {e.ctaAccount}</div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEntityEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => removeEntity(e)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Account mapping</CardTitle>
            <p className="text-xs text-muted-foreground">Which parent account each subsidiary account rolls into, at which rate, and whether it is an intercompany balance.</p>
          </div>
          <Button size="sm" onClick={() => setEditing({})} disabled={entities.length === 0}><Plus className="h-4 w-4" />Add mapping</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Entity</th>
                  <th className="p-2 text-left">Subsidiary account</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Parent account</th>
                  <th className="p-2 text-left">Rate</th>
                  <th className="p-2 text-left">Intercompany</th>
                  <th className="p-2 text-right">Share</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {maps.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No mappings yet. Unmapped accounts roll up under their own code and are flagged on every run.</td></tr>}
                {maps.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 font-mono">{m.subsidiary}</td>
                    <td className="p-2"><span className="font-mono">{m.subAccount}</span> <span className="text-muted-foreground">{m.subAccountName ?? "(not in chart)"}</span></td>
                    <td className="p-2 text-muted-foreground">{m.accountType ? TYPE_LABEL[m.accountType] : ""}</td>
                    <td className="p-2"><span className="font-mono">{m.parentAccount}</span> <span className="text-muted-foreground">{m.parentAccountName ?? "(not in chart)"}</span></td>
                    <td className="p-2">{m.rateType ? RATE_TYPE_LABEL[m.rateType] : <span className="text-muted-foreground">Default for type</span>}</td>
                    <td className="p-2">{m.intercompany ? <Badge variant="info">IC{m.icPartner ? ` · ${m.icPartner}` : ""}</Badge> : ""}</td>
                    <td className="p-2 text-right tabular-nums">{m.subsidiary === parentArea ? "100%" : share.get(m.subsidiary) ? `${Number(share.get(m.subsidiary)!.sharePct)}%` : <span className="text-amber-400">not set</span>}</td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" title="Test mapping" onClick={() => setTesting(m)}><FlaskConical className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" title="Delete" onClick={() => remove(m)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editing && <MapDialog parentArea={parentArea} available={available} entities={entities} initial={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {testing && <TestDialog map={testing} onClose={() => setTesting(null)} />}
      {entityEdit && <EntityDialog parentArea={parentArea} available={available} initial={entityEdit} onClose={() => setEntityEdit(null)} onSaved={onChanged} />}
    </div>
  );
}

function AccountSelect({ accounts, value, onChange, placeholder }: { accounts: Available["accounts"]; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {accounts.map((a) => <SelectItem key={`${a.dataAreaId}:${a.code}`} value={a.code}>{a.code} · {a.name} <span className="text-muted-foreground">({TYPE_LABEL[a.type]})</span></SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function MapDialog({ parentArea, available, entities, initial, onClose, onSaved }: {
  parentArea: string; available: Available; entities: EntityRow[]; initial: Partial<MapRow>; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!initial.id;
  const choices = [parentArea, ...entities.map((e) => e.subsidiary)];
  const [subsidiary, setSubsidiary] = useState(initial.subsidiary ?? entities[0]?.subsidiary ?? parentArea);
  const [subAccount, setSubAccount] = useState(initial.subAccount ?? "");
  const [parentAccount, setParentAccount] = useState(initial.parentAccount ?? "");
  const [rateType, setRateType] = useState<RateType | "default">(initial.rateType ?? "default");
  const [intercompany, setIntercompany] = useState(initial.intercompany ?? false);
  const [icPartner, setIcPartner] = useState(initial.icPartner ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);

  const subAccounts = available.accounts.filter((a) => a.dataAreaId === subsidiary);
  const parentAccounts = available.accounts.filter((a) => a.dataAreaId === parentArea);

  async function submit() {
    setBusy(true);
    try {
      const body = { parentAccount, rateType: rateType === "default" ? null : rateType, intercompany, icPartner: icPartner || null, note: note || null };
      if (isEdit) await apiFetch(`/api/consolidation/maps/${initial.id}`, { method: "PATCH", body: JSON.stringify({ version: initial.version, ...body }) });
      else await apiFetch("/api/consolidation/maps", { method: "POST", body: JSON.stringify({ parentArea, subsidiary, subAccount, ...body }) });
      toast({ title: "Mapping saved", variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{isEdit ? `Edit mapping ${initial.subsidiary} ${initial.subAccount}` : "New mapping"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Entity</Label>
            <Select value={subsidiary} onValueChange={(v) => { setSubsidiary(v); setSubAccount(""); }} disabled={isEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{choices.map((c) => <SelectItem key={c} value={c}>{c}{c === parentArea ? " (parent, for its own IC accounts)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Subsidiary account</Label>
            {isEdit ? <Input value={subAccount} disabled /> : <AccountSelect accounts={subAccounts} value={subAccount} onChange={setSubAccount} placeholder="Pick an account" />}
          </div>
          <div className="space-y-1.5">
            <Label>Parent account</Label>
            <AccountSelect accounts={parentAccounts} value={parentAccount} onChange={setParentAccount} placeholder="Pick a parent account" />
          </div>
          <div className="space-y-1.5">
            <Label>Translation rate</Label>
            <Select value={rateType} onValueChange={(v) => setRateType(v as RateType | "default")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default for the account type</SelectItem>
                <SelectItem value="SPOT">Closing (spot) rate</SelectItem>
                <SelectItem value="AVERAGE">Average rate</SelectItem>
                <SelectItem value="HISTORICAL">Historical rate</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Default: closing for assets and liabilities, average for revenue and expenses, historical for equity.</p>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={intercompany} onChange={(e) => setIntercompany(e.target.checked)} />Intercompany balance (eliminated on consolidation)</label>
          {intercompany && (
            <div className="space-y-1.5">
              <Label>Partner entity</Label>
              <Select value={icPartner || undefined} onValueChange={setIcPartner}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{choices.filter((c) => c !== subsidiary).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 md:col-span-2"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this account is mapped this way" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !subAccount || !parentAccount}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({ map, onClose }: { map: MapRow; onClose: () => void }) {
  const { toast } = useToast();
  const [period, setPeriod] = useState(thisMonth());
  const [result, setResult] = useState<{ line: RunLine | null; rates: Record<string, string | null> | null; currency: string; periodStart: string; periodEnd: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try { setResult(await apiFetch(`/api/consolidation/maps/${map.id}/test`, { method: "POST", body: JSON.stringify({ period }) })); }
    catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Test mapping {map.subsidiary} {map.subAccount} → {map.parentAccount}</DialogTitle></DialogHeader>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5"><Label>Period</Label><Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-08, 2026-Q3, 2026 or a date" /></div>
          <Button onClick={run} disabled={busy}>Translate</Button>
        </div>
        {result && (
          <div className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">{result.periodStart.slice(0, 10)} to {result.periodEnd.slice(0, 10)} · local currency {result.currency}</p>
            {result.rates && (
              <p className="text-xs text-muted-foreground">
                Rates: closing {result.rates.closingBegin ?? "none"} → {result.rates.closingEnd ?? "none"}, average {result.rates.averagePrior ?? "none"} → {result.rates.averagePeriod ?? "none"}, historical {result.rates.historical ?? "none"}
              </p>
            )}
            {!result.line ? <p className="text-muted-foreground">No posted balance on this account in the period.</p> : (
              <table className="w-full tabular-nums">
                <tbody>
                  <tr className="border-t"><td className="p-1 text-muted-foreground">Rate applied</td><td className="p-1 text-right">{RATE_TYPE_LABEL[result.line.rateType]} {result.line.rate ?? "(none)"}</td></tr>
                  <tr className="border-t"><td className="p-1 text-muted-foreground">Beginning</td><td className="p-1 text-right">{amt(result.line.beginningLocal, result.currency)} → {amt(result.line.beginningBase)}</td></tr>
                  <tr className="border-t"><td className="p-1 text-muted-foreground">Debit / credit</td><td className="p-1 text-right">{amt(result.line.debitLocal)} / {amt(result.line.creditLocal)}</td></tr>
                  <tr className="border-t"><td className="p-1 text-muted-foreground">Ending</td><td className="p-1 text-right">{amt(result.line.endingLocal, result.currency)} → {amt(result.line.endingBase)}</td></tr>
                  <tr className="border-t"><td className="p-1 text-muted-foreground">Elimination</td><td className="p-1 text-right">{amt(result.line.eliminationBase)}</td></tr>
                  <tr className="border-t font-semibold"><td className="p-1">Consolidated</td><td className="p-1 text-right">{amt(result.line.consolidatedBase)}</td></tr>
                </tbody>
              </table>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntityDialog({ parentArea, available, initial, onClose, onSaved }: { parentArea: string; available: Available; initial: Partial<EntityRow>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isEdit = !!initial.id;
  const options = available.companies.filter((c) => c.code !== parentArea);
  const [subsidiary, setSubsidiary] = useState(initial.subsidiary ?? options[0]?.code ?? "");
  const [sharePct, setSharePct] = useState(initial.sharePct ?? "100");
  const [ctaAccount, setCtaAccount] = useState(initial.ctaAccount ?? "3900");
  const [isActive, setIsActive] = useState(initial.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const equity = available.accounts.filter((a) => a.dataAreaId === parentArea && a.type === "EQUITY");

  async function submit() {
    setBusy(true);
    try {
      await apiFetch("/api/consolidation/entities", { method: "PUT", body: JSON.stringify({ parentArea, subsidiary, sharePct: Number(sharePct), ctaAccount, isActive }) });
      toast({ title: "Subsidiary saved", variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? `Subsidiary ${initial.subsidiary}` : "Add subsidiary"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Entity</Label>
            <Select value={subsidiary} onValueChange={setSubsidiary} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder="Pick a company" /></SelectTrigger>
              <SelectContent>{options.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} · {c.name} ({c.baseCurrency})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Ownership share %</Label><Input type="number" min="0" max="100" step="0.01" value={sharePct} onChange={(e) => setSharePct(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>CTA account (parent equity)</Label>
              {equity.length > 0 ? (
                <Select value={ctaAccount} onValueChange={setCtaAccount}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{equity.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
                </Select>
              ) : <Input value={ctaAccount} onChange={(e) => setCtaAccount(e.target.value)} />}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />Included in runs</label>
          <p className="text-xs text-muted-foreground">Below 100% the subsidiary is consolidated proportionately. The CTA account carries the cumulative translation adjustment in the consolidated equity; it is presented, not posted.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !subsidiary}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
