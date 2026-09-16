"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

/**
 * The settings behind the split: shift codes, public holidays and the
 * working-time policy. The policy arrives with Tanzanian defaults and says
 * so until someone with authority confirms it.
 */

interface ShiftCode { id: string; code: string; name: string; startTime: string; endTime: string; isNight: boolean; shiftAllowance: string; isActive: boolean; version: number }
interface Holiday { id: string; date: string; name: string }
interface Policy {
  id: string; version: number; source: string | null; verifiedAt: string | null;
  standardDailyHours: string; standardWeeklyHours: string; overtimeMultiplier: string; restDayMultiplier: string;
  nightPremiumPct: string; restDays: string; nightStart: string; nightEnd: string; standardMonthlyHours: string;
  maxDrivingHoursPerShift: string; maxDutyHoursPerShift: string; breakAfterDrivingHours: string; minBreakMinutes: number;
  maxWeeklyDutyHours: string; warnBeforeLimitHours: string;
}

const useFail = () => {
  const { toast } = useToast();
  return useCallback((e: unknown) => toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }), [toast]);
};

export function TimeSettings({ onChanged }: { onChanged: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ShiftCodes onChanged={onChanged} />
      <Holidays />
      <div className="lg:col-span-2"><PolicyForm /></div>
    </div>
  );
}

// ── Shift codes ──────────────────────────────────────────────────────────────

function ShiftCodes({ onChanged }: { onChanged: () => void }) {
  const fail = useFail();
  const { toast } = useToast();
  const [rows, setRows] = useState<ShiftCode[]>([]);
  const [editing, setEditing] = useState<Partial<ShiftCode> | null>(null);

  const load = useCallback(async () => {
    try { setRows(await apiFetch<ShiftCode[]>("/api/attendance/shift-codes?includeInactive=true")); } catch (e) { fail(e); }
  }, [fail]);
  useEffect(() => { load(); }, [load]);

  async function toggleActive(r: ShiftCode) {
    try {
      await apiFetch(`/api/attendance/shift-codes/${r.id}`, { method: "PATCH", body: JSON.stringify({ version: r.version, isActive: !r.isActive }) });
      toast({ title: r.isActive ? "Shift code retired" : "Shift code restored", variant: "success" });
      await load(); onChanged();
    } catch (e) { fail(e); }
  }

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <h3 className="text-sm font-medium">Shift codes</h3>
          <p className="text-xs text-muted-foreground">The roster codes: Day, Night, Regional. Each carries its planned window and any flat allowance paid per shift.</p>
        </div>
        <Button size="sm" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add</Button>
      </header>
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase text-muted-foreground">
          <tr><th className="p-2 text-left">Code</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Window</th><th className="p-2 text-right">Allowance</th><th className="p-2" /></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">No shift codes yet.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className={`border-t ${r.isActive ? "" : "opacity-50"}`}>
              <td className="p-2 font-mono">{r.code}{r.isNight && <Badge variant="info" className="ml-1">night</Badge>}</td>
              <td className="p-2">{r.name}</td>
              <td className="p-2 tabular-nums">{r.startTime} - {r.endTime}</td>
              <td className="p-2 text-right tabular-nums">{Number(r.shiftAllowance).toLocaleString()}</td>
              <td className="p-2 text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="outline" size="sm" onClick={() => setEditing(r)}>Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleActive(r)}>{r.isActive ? "Retire" : "Restore"}</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <ShiftCodeDialog initial={editing} onClose={() => setEditing(null)} onSaved={() => { load(); onChanged(); }} />}
    </section>
  );
}

function ShiftCodeDialog({ initial, onClose, onSaved }: { initial: Partial<ShiftCode>; onClose: () => void; onSaved: () => void }) {
  const fail = useFail();
  const { toast } = useToast();
  const [f, setF] = useState({
    code: initial.code ?? "", name: initial.name ?? "", startTime: initial.startTime ?? "06:00", endTime: initial.endTime ?? "15:00",
    isNight: initial.isNight ?? false, shiftAllowance: initial.shiftAllowance ?? "0",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    setBusy(true);
    try {
      if (initial.id) {
        // The code is the identity other records refer to; it is not editable.
        const { name, startTime, endTime, isNight, shiftAllowance } = f;
        await apiFetch(`/api/attendance/shift-codes/${initial.id}`, { method: "PATCH", body: JSON.stringify({ version: initial.version, name, startTime, endTime, isNight, shiftAllowance }) });
      } else {
        await apiFetch("/api/attendance/shift-codes", { method: "POST", body: JSON.stringify(f) });
      }
      toast({ title: "Shift code saved", variant: "success" });
      onSaved(); onClose();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial.id ? `Edit ${initial.code}` : "New shift code"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Code</Label><Input value={f.code} disabled={!!initial.id} placeholder="DAY" onChange={(e) => set("code", e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name} placeholder="Day shift" onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Starts</Label><Input type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Ends</Label><Input type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Allowance per shift</Label><Input type="number" min="0" step="0.01" value={f.shiftAllowance} onChange={(e) => set("shiftAllowance", e.target.value)} /></div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.isNight} onChange={(e) => set("isNight", e.target.checked)} />Night shift</label>
        </div>
        <p className="text-xs text-muted-foreground">An end time before the start means the shift crosses midnight.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !f.code || !f.name}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Public holidays ──────────────────────────────────────────────────────────

function Holidays() {
  const fail = useFail();
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [rows, setRows] = useState<Holiday[]>([]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await apiFetch<Holiday[]>(`/api/attendance/public-holidays?year=${year}`)); } catch (e) { fail(e); }
  }, [year, fail]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setBusy(true);
    try {
      await apiFetch("/api/attendance/public-holidays", { method: "POST", body: JSON.stringify({ date, name }) });
      toast({ title: "Holiday added", variant: "success" });
      setDate(""); setName(""); await load();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await apiFetch(`/api/attendance/public-holidays/${id}`, { method: "DELETE" }); await load(); } catch (e) { fail(e); }
  }

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <h3 className="text-sm font-medium">Public holidays</h3>
          <p className="text-xs text-muted-foreground">Hours worked on these are paid at the rest-day multiple.</p>
        </div>
        <Input type="number" className="h-8 w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} />
      </header>
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">No holidays recorded for {year}.</td></tr>}
          {rows.map((h) => (
            <tr key={h.id} className="border-t">
              <td className="p-2 tabular-nums">{h.date.slice(0, 10)}</td>
              <td className="p-2">{h.name}</td>
              <td className="p-2 text-right"><Button variant="ghost" size="sm" onClick={() => remove(h.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-end gap-2 border-t p-3">
        <div className="space-y-1"><Label className="text-xs">Date</Label><Input className="h-9" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="flex-1 space-y-1"><Label className="text-xs">Name</Label><Input className="h-9" placeholder="Independence Day" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button size="sm" disabled={busy || !date || !name} onClick={add}><Plus className="h-3.5 w-3.5" />Add</Button>
      </div>
    </section>
  );
}

// ── Policy ───────────────────────────────────────────────────────────────────

const PAY_FIELDS: { key: keyof Policy; label: string; hint: string; type?: string }[] = [
  { key: "standardDailyHours", label: "Standard hours a day", hint: "Beyond this is overtime" },
  { key: "standardWeeklyHours", label: "Standard hours a week", hint: "Regular hours beyond this become overtime" },
  { key: "overtimeMultiplier", label: "Overtime multiple", hint: "1.5 = time and a half" },
  { key: "restDayMultiplier", label: "Rest day and holiday multiple", hint: "2 = double time" },
  { key: "nightPremiumPct", label: "Night premium %", hint: "Added per hour inside the night window" },
  { key: "restDays", label: "Rest days", hint: "MON..SUN, comma-separated", type: "text" },
  { key: "nightStart", label: "Night window starts", hint: "HH:MM", type: "time" },
  { key: "nightEnd", label: "Night window ends", hint: "HH:MM", type: "time" },
  { key: "standardMonthlyHours", label: "Hours in a standard month", hint: "Basic pay over this gives the hourly rate" },
];
const HOS_FIELDS: { key: keyof Policy; label: string; hint: string }[] = [
  { key: "maxDrivingHoursPerShift", label: "Max driving per shift", hint: "hours" },
  { key: "maxDutyHoursPerShift", label: "Max duty per shift", hint: "hours" },
  { key: "breakAfterDrivingHours", label: "Break due after", hint: "hours of driving" },
  { key: "minBreakMinutes", label: "Minimum break", hint: "minutes, to reset the driving clock" },
  { key: "maxWeeklyDutyHours", label: "Max duty in 7 days", hint: "hours, rolling" },
  { key: "warnBeforeLimitHours", label: "Warn within", hint: "hours of a limit" },
];

function PolicyForm() {
  const fail = useFail();
  const { toast } = useToast();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await apiFetch<Policy>("/api/attendance/policy");
      setPolicy(p);
      const d: Record<string, string> = {};
      for (const f of [...PAY_FIELDS, ...HOS_FIELDS]) d[f.key] = String(p[f.key] ?? "");
      d.verifiedAt = p.verifiedAt ? p.verifiedAt.slice(0, 10) : "";
      setDraft(d);
    } catch (e) { fail(e); }
  }, [fail]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!policy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { version: policy.version };
      for (const f of [...PAY_FIELDS, ...HOS_FIELDS]) if (draft[f.key] !== String(policy[f.key] ?? "")) body[f.key] = draft[f.key];
      const v = draft.verifiedAt || null;
      if (v !== (policy.verifiedAt ? policy.verifiedAt.slice(0, 10) : null)) body.verifiedAt = v;
      await apiFetch("/api/attendance/policy", { method: "PATCH", body: JSON.stringify(body) });
      toast({ title: "Policy saved", variant: "success" });
      await load();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  if (!policy) return null;
  const field = (f: { key: keyof Policy; label: string; hint: string; type?: string }) => (
    <div key={f.key} className="space-y-1">
      <Label className="text-xs">{f.label}</Label>
      <Input className="h-9" type={f.type ?? "number"} step="0.01" value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
      <div className="text-[11px] text-muted-foreground">{f.hint}</div>
    </div>
  );

  return (
    <section className="rounded-md border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div>
          <h3 className="text-sm font-medium">Working-time policy</h3>
          <p className="text-xs text-muted-foreground">{policy.source ?? "The rules the timesheet split and hours-of-service checks read from."}</p>
        </div>
        {policy.verifiedAt
          ? <Badge variant="success">Confirmed {policy.verifiedAt.slice(0, 10)}</Badge>
          : <Badge variant="warning">Defaults, not yet confirmed</Badge>}
      </header>
      <div className="grid gap-4 p-3 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Pay rules</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{PAY_FIELDS.map(field)}</div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Hours of service</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{HOS_FIELDS.map(field)}</div>
          <div className="mt-3 space-y-1">
            <Label className="text-xs">Confirmed on</Label>
            <Input className="h-9 w-44" type="date" value={draft.verifiedAt ?? ""} onChange={(e) => setDraft((d) => ({ ...d, verifiedAt: e.target.value }))} />
            <div className="text-[11px] text-muted-foreground">Set once the customer&#39;s HR or accountant has checked these figures.</div>
          </div>
        </div>
      </div>
      <div className="flex justify-end border-t p-3">
        <Button disabled={busy} onClick={save}><Save className="h-4 w-4" />Save policy</Button>
      </div>
    </section>
  );
}
