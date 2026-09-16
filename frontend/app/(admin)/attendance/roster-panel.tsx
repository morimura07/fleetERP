"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarPlus, X } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { Lookups } from "./shared";

/**
 * The week's plan as a grid: one row per employee, one column per day, the
 * shift code in each cell. Click an empty cell to plan that day; the cross
 * on a planned cell removes it. "Plan a range" fills many people and days
 * at once.
 */

interface RosterRow {
  id: string;
  employeeId: string;
  date: string;
  shiftCode: { code: string; name: string; isNight: boolean };
  vehicle: { vehicleNumber: string } | null;
  trip: { originFacility: string | null; destinationFacility: string | null } | null;
  employee: { code: string; name: string };
}

const DAY = 86_400_000;
const WEEKDAY = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const key = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the week containing the given UTC date. */
function mondayOf(d: Date): Date {
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
}

export function RosterPanel({ lookups }: { lookups: Lookups }) {
  const { toast } = useToast();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [planOpen, setPlanOpen] = useState(false);
  const [cell, setCell] = useState<{ employeeId: string; date: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * DAY));
  const from = key(days[0]);
  const to = key(days[6]);

  const load = useCallback(async () => {
    try { setRows(await apiFetch<RosterRow[]>(`/api/attendance/roster?from=${from}&to=${to}`)); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
  }, [from, to, toast]);
  useEffect(() => { load(); }, [load]);

  const byCell = new Map(rows.map((r) => [`${r.employeeId}:${r.date.slice(0, 10)}`, r]));

  async function remove(id: string) {
    setBusy(true);
    try { await apiFetch(`/api/attendance/roster/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setMonday(new Date(monday.getTime() - 7 * DAY))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-medium tabular-nums">{from} to {to}</span>
        <Button variant="outline" size="sm" onClick={() => setMonday(new Date(monday.getTime() + 7 * DAY))}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setMonday(mondayOf(new Date()))}>This week</Button>
        <div className="ml-auto">
          <Button onClick={() => setPlanOpen(true)} disabled={lookups.shiftCodes.length === 0}><CalendarPlus className="h-4 w-4" />Plan a range</Button>
        </div>
      </div>
      {lookups.shiftCodes.length === 0 && (
        <p className="text-sm text-muted-foreground">Add a shift code under Settings before planning a roster.</p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-elevated/80 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Employee</th>
              {days.map((d, i) => (
                <th key={i} className="p-2 text-center">
                  <div>{WEEKDAY[i]}</div>
                  <div className="font-normal normal-case tabular-nums">{key(d).slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lookups.employees.length === 0 && <tr><td colSpan={8} className="p-3 text-center text-muted-foreground">No employees.</td></tr>}
            {lookups.employees.map((emp) => (
              <tr key={emp.id} className="border-t">
                <td className="whitespace-nowrap p-2">{emp.name} <span className="font-mono text-xs text-muted-foreground">{emp.code}</span></td>
                {days.map((d) => {
                  const r = byCell.get(`${emp.id}:${key(d)}`);
                  return (
                    <td key={key(d)} className="p-1 text-center">
                      {r ? (
                        <div className={`group relative inline-flex items-center rounded px-2 py-1 text-xs ${r.shiftCode.isNight ? "bg-indigo-500/15 text-indigo-300" : "bg-sky-500/15 text-sky-300"}`} title={`${r.shiftCode.name}${r.vehicle ? ` · ${r.vehicle.vehicleNumber}` : ""}`}>
                          <span className="font-mono">{r.shiftCode.code}</span>
                          {r.vehicle && <span className="ml-1 text-muted-foreground">{r.vehicle.vehicleNumber}</span>}
                          <button className="ml-1 hidden text-muted-foreground hover:text-foreground group-hover:inline" disabled={busy} onClick={() => remove(r.id)} title="Remove"><X className="h-3 w-3" /></button>
                        </div>
                      ) : (
                        <button className="h-7 w-full rounded text-xs text-muted-foreground/40 hover:bg-elevated hover:text-foreground" disabled={lookups.shiftCodes.length === 0} onClick={() => setCell({ employeeId: emp.id, date: key(d) })}>+</button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {planOpen && <PlanDialog lookups={lookups} from={from} to={to} onClose={() => setPlanOpen(false)} onSaved={load} />}
      {cell && <CellDialog lookups={lookups} cell={cell} onClose={() => setCell(null)} onSaved={load} />}
    </div>
  );
}

function CellDialog({ lookups, cell, onClose, onSaved }: { lookups: Lookups; cell: { employeeId: string; date: string }; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [shiftCodeId, setShiftCodeId] = useState(lookups.shiftCodes[0]?.id ?? "");
  const [vehicleId, setVehicleId] = useState("");
  const [busy, setBusy] = useState(false);
  const emp = lookups.employees.find((e) => e.id === cell.employeeId);

  async function submit() {
    setBusy(true);
    try {
      await apiFetch("/api/attendance/roster", { method: "PUT", body: JSON.stringify({ ...cell, shiftCodeId, vehicleId: vehicleId || null }) });
      toast({ title: "Shift planned", variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{emp?.name} · {cell.date}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Shift</Label>
            <Select value={shiftCodeId} onValueChange={setShiftCodeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{lookups.shiftCodes.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} · {s.name} ({s.startTime}-{s.endTime})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vehicle (optional)</Label>
            <Select value={vehicleId || "none"} onValueChange={(v) => setVehicleId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {lookups.vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicleNumber} · {v.plateNumber}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !shiftCodeId}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({ lookups, from: f0, to: t0, onClose, onSaved }: { lookups: Lookups; from: string; to: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [shiftCodeId, setShiftCodeId] = useState(lookups.shiftCodes[0]?.id ?? "");
  const [from, setFrom] = useState(f0);
  const [to, setTo] = useState(t0);
  const [weekdays, setWeekdays] = useState<string[]>(["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], v: string, set: (l: string[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function submit() {
    setBusy(true);
    try {
      const res = await apiFetch<{ planned: number; skipped: number; days: number }>("/api/attendance/roster/plan", {
        method: "POST", body: JSON.stringify({ employeeIds, shiftCodeId, from, to, weekdays, replace }),
      });
      toast({ title: "Roster planned", description: `${res.planned} shifts planned, ${res.skipped} already planned left alone`, variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Plan a range</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Employees</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={employeeIds.length === lookups.employees.length} onChange={(e) => setEmployeeIds(e.target.checked ? lookups.employees.map((x) => x.id) : [])} />Everyone
              </label>
              {lookups.employees.map((e) => (
                <label key={e.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={employeeIds.includes(e.id)} onChange={() => toggle(employeeIds, e.id, setEmployeeIds)} />{e.name} <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Shift</Label>
            <Select value={shiftCodeId} onValueChange={setShiftCodeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{lookups.shiftCodes.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} · {s.name} ({s.startTime}-{s.endTime})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Days</Label>
            <div className="flex flex-wrap gap-1">
              {WEEKDAY.map((d) => (
                <button key={d} type="button" onClick={() => toggle(weekdays, d, setWeekdays)}
                  className={`rounded border px-2 py-1 text-xs ${weekdays.includes(d) ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground"}`}>{d}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Replace days already planned
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || employeeIds.length === 0 || !shiftCodeId || weekdays.length === 0}>Plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
