"use client";
import { useCallback, useEffect, useState } from "react";
import { Play, Square, Trash2, LogOut, AlertTriangle } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import {
  ATTENDANCE_SOURCE_LABEL, SHIFT_ACTIVITY_LABEL, DUTY_STATUS_LABEL, DUTY_STATUS_VARIANT,
  FATIGUE_STATUS_LABEL, FATIGUE_STATUS_VARIANT,
} from "@frontend/lib/labels";
import type { ShiftActivityKind } from "@frontend/lib/enums";
import { type EntryDetail as Detail, type HosStatus, fmtTime, fmtDateTime, hrs, nowLocalInput, localInputToIso } from "./shared";

/**
 * One shift: who, when, where, the tasks inside it, and where the driver
 * stands against the hours-of-service rules while the shift is open.
 */
export function EntryDetailDialog({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [entry, setEntry] = useState<Detail | null>(null);
  const [hos, setHos] = useState<HosStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback((e: unknown) => toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }), [toast]);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<Detail>(`/api/attendance/entries/${id}`);
      setEntry(d);
      setHos(d.clockOut ? null : await apiFetch<HosStatus>(`/api/attendance/employees/${d.employeeId}/hos`));
    } catch (e) { fail(e); }
  }, [id, fail]);
  useEffect(() => { load(); }, [load]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); toast({ title: label, variant: "success" }); onChange(); await load(); }
    catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  const locked = !!entry?.timesheet && entry.timesheet.status !== "OPEN";
  const open = !!entry && !entry.clockOut;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{entry ? `${entry.employee.name} · ${entry.workDate.slice(0, 10)}` : "Loading…"}</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="space-y-4">
            {/* ── Who, when, where ── */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <Fact label="Shift" value={entry.shiftCode ? `${entry.shiftCode.code} · ${entry.shiftCode.name}` : "None"} />
              <Fact label="Scheduled" value={entry.scheduledStart && entry.scheduledEnd ? `${fmtTime(entry.scheduledStart)} - ${fmtTime(entry.scheduledEnd)}` : "No roster"} />
              <Fact label="Clock in" value={`${fmtTime(entry.clockIn)}${entry.clockInPlace ? ` · ${entry.clockInPlace}` : ""}`} hint={ATTENDANCE_SOURCE_LABEL[entry.source]} />
              <Fact label="Clock out" value={entry.clockOut ? `${fmtTime(entry.clockOut)}${entry.clockOutPlace ? ` · ${entry.clockOutPlace}` : ""}` : "Still on shift"} />
              <Fact label="Vehicle" value={entry.vehicle?.vehicleNumber ?? "None"} />
              <Fact label="Trip" value={entry.trip ? `${entry.trip.originFacility ?? "?"} → ${entry.trip.destinationFacility ?? "?"}` : "None"} />
              <Fact label="Late" value={entry.lateMinutes > 0 ? `${entry.lateMinutes} min` : "On time"} tone={entry.lateMinutes > 0 ? "warn" : undefined} />
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Duty status</div>
                <Badge variant={DUTY_STATUS_VARIANT[entry.dutyStatus]}>{DUTY_STATUS_LABEL[entry.dutyStatus]}</Badge>
              </div>
            </div>

            {/* ── Hours of service while open ── */}
            {hos && (
              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <span className="font-medium">Hours of service</span>
                  <Badge variant={FATIGUE_STATUS_VARIANT[hos.status]}>{FATIGUE_STATUS_LABEL[hos.status]}</Badge>
                  {!hos.policyVerified && <span className="text-xs text-muted-foreground">policy limits not yet confirmed</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Fact label="Driving this shift" value={hrs(hos.drivingHours)} hint={`${hrs(hos.drivingRemaining)} left`} />
                  <Fact label="On duty this shift" value={hrs(hos.dutyHours)} hint={`${hrs(hos.dutyRemaining)} left`} />
                  <Fact label="Since last break" value={hrs(hos.drivingSinceBreak)} tone={hos.breakDue ? "danger" : undefined} />
                  <Fact label="Rolling 7 days" value={hrs(hos.weeklyDutyHours)} hint={`${hrs(hos.weeklyRemaining)} left`} />
                </div>
                {hos.alerts.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-red-400">
                    {hos.alerts.map((a) => <li key={a} className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{a}</li>)}
                  </ul>
                )}
              </div>
            )}

            {/* ── Tasks ── */}
            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
                <span className="font-medium">Tasks</span>
                {entry.timesheet && <span className="text-xs text-muted-foreground">Timesheet {entry.timesheet.period} · {entry.timesheet.status}</span>}
              </div>
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground">
                  <tr><th className="p-2 text-left">Task</th><th className="p-2 text-left">Start</th><th className="p-2 text-left">End</th><th className="p-2 text-left">Place</th><th className="p-2 text-right">Hours</th><th className="w-20" /></tr>
                </thead>
                <tbody>
                  {entry.activities.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No tasks recorded.</td></tr>}
                  {entry.activities.map((a) => {
                    const end = a.endedAt ? new Date(a.endedAt) : null;
                    const h = end ? (end.getTime() - new Date(a.startedAt).getTime()) / 3_600_000 : null;
                    return (
                      <tr key={a.id} className="border-t">
                        <td className="p-2">{SHIFT_ACTIVITY_LABEL[a.kind]}</td>
                        <td className="p-2 tabular-nums">{fmtDateTime(a.startedAt)}</td>
                        <td className="p-2 tabular-nums">{a.endedAt ? fmtDateTime(a.endedAt) : <Badge variant="success">In progress</Badge>}</td>
                        <td className="p-2 text-muted-foreground">{a.place ?? ""}</td>
                        <td className="p-2 text-right tabular-nums">{h != null ? h.toFixed(2) : ""}</td>
                        <td className="p-2 text-right">
                          {!locked && (
                            <div className="flex justify-end gap-1">
                              {!a.endedAt && (
                                <Button variant="outline" size="sm" disabled={busy} title="End task"
                                  onClick={() => run("Task ended", () => apiFetch(`/api/attendance/activities/${a.id}/end`, { method: "POST", body: JSON.stringify({}) }))}>
                                  <Square className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="outline" size="sm" disabled={busy} title="Delete task"
                                onClick={() => run("Task deleted", () => apiFetch(`/api/attendance/activities/${a.id}`, { method: "DELETE" }))}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!locked && <StartTaskForm entryId={entry.id} open={open} busy={busy} onStart={(body) => run("Task started", () => apiFetch(`/api/attendance/entries/${entry.id}/activities`, { method: "POST", body: JSON.stringify(body) }))} />}
            </div>

            {/* ── Split, once the shift is closed ── */}
            {entry.breakdown && (
              <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
                <Fact label="Worked" value={hrs(entry.breakdown.worked)} hint={`${hrs(entry.breakdown.breaks)} breaks`} />
                <Fact label="Regular" value={hrs(entry.breakdown.regular)} />
                <Fact label="Overtime" value={hrs(entry.breakdown.overtime)} />
                <Fact label={entry.breakdown.restDay ? "Rest-day premium" : "Premium"} value={hrs(entry.breakdown.premium)} />
                <Fact label="Night" value={hrs(entry.breakdown.night)} />
                <Fact label="Driving / waiting" value={`${entry.breakdown.driving} / ${entry.breakdown.waiting} h`} />
              </div>
            )}

            <DialogFooter className="gap-2">
              {open && !locked && (
                <Button variant="outline" disabled={busy}
                  onClick={() => run("Clocked out", () => apiFetch(`/api/attendance/entries/${entry.id}/clock-out`, { method: "POST", body: JSON.stringify({ at: new Date().toISOString() }) }))}>
                  <LogOut className="h-4 w-4" />Clock out now
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "danger" }) {
  const color = tone === "danger" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * Start a task now (open shift) or record one with both times (closed
 * shift). Kept inline so a dispatcher logs a border crossing in two clicks.
 */
function StartTaskForm({ entryId, open, busy, onStart }: {
  entryId: string; open: boolean; busy: boolean;
  onStart: (body: { kind: ShiftActivityKind; startedAt: string; endedAt: string | null; place?: string }) => void;
}) {
  const [kind, setKind] = useState<ShiftActivityKind>("DRIVING");
  const [place, setPlace] = useState("");
  const [startedAt, setStartedAt] = useState(nowLocalInput());
  const [endedAt, setEndedAt] = useState("");
  const [showTimes, setShowTimes] = useState(!open);

  function submit() {
    onStart({
      kind,
      startedAt: showTimes ? localInputToIso(startedAt) : new Date().toISOString(),
      endedAt: showTimes && endedAt ? localInputToIso(endedAt) : null,
      place: place || undefined,
    });
    setPlace(""); setEndedAt("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t p-3" data-entry={entryId}>
      <div className="min-w-[160px] space-y-1">
        <Label className="text-xs">Task</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as ShiftActivityKind)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SHIFT_ACTIVITY_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="min-w-[160px] flex-1 space-y-1">
        <Label className="text-xs">Place</Label>
        <Input className="h-9" placeholder="Dock 3, Namanga border, Puma Mbezi" value={place} onChange={(e) => setPlace(e.target.value)} />
      </div>
      {showTimes && (
        <>
          <div className="space-y-1"><Label className="text-xs">Start</Label><Input className="h-9" type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">End</Label><Input className="h-9" type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} /></div>
        </>
      )}
      {open && !showTimes && <Button variant="ghost" size="sm" onClick={() => setShowTimes(true)}>Set times</Button>}
      <Button size="sm" disabled={busy} onClick={submit}><Play className="h-3.5 w-3.5" />{showTimes ? "Record" : "Start now"}</Button>
    </div>
  );
}
