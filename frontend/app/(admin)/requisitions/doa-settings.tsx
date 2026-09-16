"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Save, AlertTriangle } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { type DoaSettings, type Tier, type Policy, type DoaMode, MODE_LABEL } from "./shared";

/**
 * The delegation-of-authority matrix and the procurement policy, as
 * settings (client requirements: "configure all the settings for the
 * values, approval tiers and workflow action"). Problems with the matrix
 * are shown here, before a requisition finds them.
 */
export function DoaSettingsPanel() {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);
  const [s, setS] = useState<DoaSettings | null>(null);
  const [editing, setEditing] = useState<Partial<Tier> | null>(null);

  const load = useCallback(async () => {
    try { setS(await apiFetch<DoaSettings>("/api/requisitions/settings/doa")); } catch (e) { fail(e); }
  }, [fail]);
  useEffect(() => { load(); }, [load]);

  async function remove(t: Tier) {
    try { await apiFetch(`/api/requisitions/settings/doa/tiers/${t.id}`, { method: "DELETE" }); toast({ title: "Tier removed", variant: "success" }); await load(); }
    catch (e) { fail(e); }
  }

  if (!s) return null;
  const roleName = (key: string) => s.availableRoles.find((r) => r.key === key)?.name ?? key;

  return (
    <div className="space-y-4">
      {s.problems.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          {s.problems.map((p) => <p key={p} className="flex items-center gap-2 text-amber-500"><AlertTriangle className="h-4 w-4 shrink-0" />{p}</p>)}
        </div>
      )}

      <section className="rounded-md border">
        <header className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <h3 className="text-sm font-medium">Approval tiers</h3>
            <p className="text-xs text-muted-foreground">Value bands in {s.policy.thresholdCurrency}; other currencies are converted at the day&#39;s rate. Roles are the company&#39;s own.</p>
          </div>
          <Button size="sm" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add tier</Button>
        </header>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground">
            <tr><th className="p-2 text-left">Tier</th><th className="p-2 text-right">From</th><th className="p-2 text-right">To</th><th className="p-2 text-left">Approvers</th><th className="p-2 text-left">Mode</th><th className="p-2 text-left">Gates</th><th /></tr>
          </thead>
          <tbody className="tabular-nums">
            {s.tiers.map((t) => (
              <tr key={t.id} className={`border-t ${t.isActive ? "" : "opacity-50"}`}>
                <td className="p-2">{t.name}</td>
                <td className="p-2 text-right">{Number(t.minAmount).toLocaleString()}</td>
                <td className="p-2 text-right">{t.maxAmount == null ? "no ceiling" : Number(t.maxAmount).toLocaleString()}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {t.approverRoles.map((k) => {
                      const r = s.roles.find((x) => x.key === k);
                      return <Badge key={k} variant={r && (!r.exists || r.holders === 0) ? "warning" : "secondary"}>{roleName(k)}{r?.holders != null ? ` (${r.holders})` : ""}</Badge>;
                    })}
                  </div>
                </td>
                <td className="p-2 text-xs">{MODE_LABEL[t.mode]}{t.mode !== "ANY" ? `, ${t.minSignatures} needed` : ""}</td>
                <td className="p-2 text-xs text-muted-foreground">{[t.requiresBudgetSignOff && "budget sign-off", t.requiresBidSummary && "bid summary", t.autoRelease && "auto-release PO"].filter(Boolean).join(", ")}</td>
                <td className="p-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <PolicyForm policy={s.policy} onSaved={load} />

      {editing && <TierDialog initial={editing} roles={s.availableRoles} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function TierDialog({ initial, roles, onClose, onSaved }: { initial: Partial<Tier>; roles: { key: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isEdit = !!initial.id;
  const [f, setF] = useState({
    name: initial.name ?? "", minAmount: initial.minAmount ?? "0", maxAmount: initial.maxAmount ?? "", currency: initial.currency ?? "USD",
    approverRoles: initial.approverRoles ?? [], mode: (initial.mode ?? "SEQUENTIAL") as DoaMode, minSignatures: String(initial.minSignatures ?? 1),
    requiresBudgetSignOff: initial.requiresBudgetSignOff ?? false, requiresBidSummary: initial.requiresBidSummary ?? false, autoRelease: initial.autoRelease ?? false,
    sortOrder: String(initial.sortOrder ?? 0), isActive: initial.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const toggleRole = (k: string) => set("approverRoles", f.approverRoles.includes(k) ? f.approverRoles.filter((x) => x !== k) : [...f.approverRoles, k]);

  async function submit() {
    setBusy(true);
    try {
      const body = { ...f, minAmount: Number(f.minAmount), maxAmount: f.maxAmount === "" ? null : Number(f.maxAmount), minSignatures: Number(f.minSignatures), sortOrder: Number(f.sortOrder) };
      if (isEdit) await apiFetch(`/api/requisitions/settings/doa/tiers/${initial.id}`, { method: "PATCH", body: JSON.stringify({ version: initial.version, ...body }) });
      else await apiFetch("/api/requisitions/settings/doa/tiers", { method: "POST", body: JSON.stringify(body) });
      toast({ title: "Tier saved", variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{isEdit ? `Edit ${initial.name}` : "New approval tier"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2"><Label>Name</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="5,001 to 25,000" /></div>
          <div className="space-y-1.5"><Label>From</Label><Input type="number" min="0" step="0.01" value={f.minAmount} onChange={(e) => set("minAmount", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>To (blank = no ceiling)</Label><Input type="number" min="0" step="0.01" value={f.maxAmount ?? ""} onChange={(e) => set("maxAmount", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Currency</Label><CurrencySelect value={f.currency} onChange={(v) => set("currency", v)} /></div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={f.mode} onValueChange={(v) => set("mode", v as DoaMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(MODE_LABEL) as DoaMode[]).map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Approver roles</Label>
            <div className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <button key={r.key} type="button" onClick={() => toggleRole(r.key)} className={`rounded border px-2 py-1 text-xs ${f.approverRoles.includes(r.key) ? "border-primary bg-primary/15" : "text-muted-foreground"}`}>{r.name}</button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Missing a role? Create it under Roles first, then assign it to the people who sign.</p>
          </div>
          {f.mode !== "ANY" && <div className="space-y-1.5"><Label>Signatures needed</Label><Input type="number" min="1" max={Math.max(1, f.approverRoles.length)} value={f.minSignatures} onChange={(e) => set("minSignatures", e.target.value)} /></div>}
          <div className="space-y-1.5"><Label>Order</Label><Input type="number" min="0" value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requiresBudgetSignOff} onChange={(e) => set("requiresBudgetSignOff", e.target.checked)} />Requires budget validation sign-off</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requiresBidSummary} onChange={(e) => set("requiresBidSummary", e.target.checked)} />Requires bid comparison summary</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.autoRelease} onChange={(e) => set("autoRelease", e.target.checked)} />Approval releases the PO at once</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} />Active</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !f.name || f.approverRoles.length === 0}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FIELDS: { key: keyof Policy; label: string; hint: string; type?: string }[] = [
  { key: "minQuotes", label: "Minimum quotes before a PO", hint: "Fewer needs a single-source justification" },
  { key: "priceTolerancePct", label: "Match price tolerance %", hint: "PO vs invoice" },
  { key: "quantityTolerancePct", label: "Match quantity tolerance %", hint: "ordered vs received vs billed" },
  { key: "overDeliveryTolerancePct", label: "Over-delivery tolerance %", hint: "accepted at goods receipt" },
  { key: "retriggerVariancePct", label: "Re-open approval above %", hint: "change order variance" },
  { key: "retriggerVarianceAmount", label: "Re-open approval above amount", hint: "0 = percentage only" },
  { key: "poTurnaroundSlaDays", label: "PO turnaround SLA (days)", hint: "requisition approval to PO issue" },
];

function PolicyForm({ policy, onSaved }: { policy: Policy; onSaved: () => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(policy[f.key])])));
  const [docs, setDocs] = useState(policy.shippingDocsBeforeGrn);
  const [ccy, setCcy] = useState(policy.thresholdCurrency);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { version: policy.version };
      for (const f of FIELDS) if (d[f.key] !== String(policy[f.key])) body[f.key] = Number(d[f.key]);
      if (docs !== policy.shippingDocsBeforeGrn) body.shippingDocsBeforeGrn = docs;
      if (ccy !== policy.thresholdCurrency) body.thresholdCurrency = ccy;
      await apiFetch("/api/requisitions/settings/policy", { method: "PATCH", body: JSON.stringify(body) });
      toast({ title: "Policy saved", variant: "success" });
      onSaved();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-md border">
      <header className="border-b px-3 py-2">
        <h3 className="text-sm font-medium">Procurement policy</h3>
        <p className="text-xs text-muted-foreground">The gates and tolerances the SOP enforces.</p>
      </header>
      <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            <Input className="h-9" type="number" step="0.01" value={d[f.key]} onChange={(e) => setD((x) => ({ ...x, [f.key]: e.target.value }))} />
            <div className="text-[11px] text-muted-foreground">{f.hint}</div>
          </div>
        ))}
        <div className="space-y-1">
          <Label className="text-xs">Threshold currency</Label>
          <CurrencySelect value={ccy} onChange={setCcy} />
          <div className="text-[11px] text-muted-foreground">tiers are read in this currency</div>
        </div>
        <label className="flex items-center gap-2 self-end pb-5 text-sm"><input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} />Shipping documents before goods receipt</label>
      </div>
      <div className="flex justify-end border-t p-3"><Button disabled={busy} onClick={save}><Save className="h-4 w-4" />Save policy</Button></div>
    </section>
  );
}
