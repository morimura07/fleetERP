"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, LogOut, Trash2, CalendarClock, Send, CheckCircle2, XCircle, Eye } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@frontend/components/ui/tabs";
import { useToast } from "@frontend/components/ui/toast";
import { ATTENDANCE_SOURCE_LABEL, TIMESHEET_STATUS_LABEL, TIMESHEET_STATUS_VARIANT, DUTY_STATUS_LABEL, DUTY_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { AttendanceSource } from "@frontend/lib/enums";
import { EntryDetailDialog } from "./entry-detail";
import { RosterPanel } from "./roster-panel";
import { TimeSettings } from "./time-settings";
import { type Lookups, type EntryRow, type SheetRow, fmtTime, hrs, money, today, thisMonth, nowLocalInput, localInputToIso } from "./shared";

export function AttendanceManager({ lookups: initial }: { lookups: Lookups }) {
  const [lookups, setLookups] = useState(initial);
  const [entryRefresh, setEntryRefresh] = useState(0);
  const [sheetRefresh, setSheetRefresh] = useState(0);
  const [entryOpen, setEntryOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);

  const refreshAll = () => { setEntryRefresh((k) => k + 1); setSheetRefresh((k) => k + 1); };
  const reloadLookups = async () => { try { setLookups(await apiFetch<Lookups>("/api/lookups/attendance-form")); } catch { /* keep what we have */ } };
  const ccy = (employeeId: string) => lookups.employees.find((e) => e.id === employeeId)?.currency ?? "TZS";

  const entryColumns: Column<EntryRow>[] = [
    { key: "employee", header: "Employee", render: (r) => <span>{r.employee.name} <span className="font-mono text-xs text-muted-foreground">{r.employee.code}</span></span> },
    { key: "workDate", header: "Date", render: (r) => r.workDate.slice(0, 10) },
    { key: "shiftCode", header: "Shift", render: (r) => r.shiftCode ? <span className="font-mono text-xs">{r.shiftCode.code}</span> : <span className="text-xs text-muted-foreground">none</span> },
    { key: "clockIn", header: "In", render: (r) => <span className="tabular-nums">{fmtTime(r.clockIn)}{r.lateMinutes > 0 && <span className="ml-1 text-xs text-amber-400">+{r.lateMinutes}m</span>}</span> },
    { key: "clockOut", header: "Out", render: (r) => r.clockOut ? <span className="tabular-nums">{fmtTime(r.clockOut)}</span> : <Badge variant={DUTY_STATUS_VARIANT[r.dutyStatus]}>{DUTY_STATUS_LABEL[r.dutyStatus]}</Badge> },
    { key: "hours", header: "Hours", render: (r) => <span className="tabular-nums">{r.hours}</span> },
    { key: "vehicle", header: "Vehicle", render: (r) => <span className="text-xs text-muted-foreground">{r.vehicle?.vehicleNumber ?? ""}</span> },
    { key: "source", header: "Source", render: (r) => <span className="text-xs text-muted-foreground">{ATTENDANCE_SOURCE_LABEL[r.source]}</span> },
  ];

  const sheetColumns: Column<SheetRow>[] = [
    { key: "employee", header: "Employee", render: (r) => <span>{r.employee.name} <span className="font-mono text-xs text-muted-foreground">{r.employee.code}</span></span> },
    { key: "period", header: "Period", render: (r) => <span className="font-mono">{r.period}</span> },
    { key: "regularHours", header: "Regular", render: (r) => <span className="tabular-nums">{hrs(r.regularHours)}</span> },
    { key: "overtimeHours", header: "Overtime", render: (r) => <span className="tabular-nums">{hrs(r.overtimeHours)}</span> },
    { key: "premiumHours", header: "Premium", render: (r) => <span className="tabular-nums">{hrs(r.premiumHours)}</span> },
    { key: "nightHours", header: "Night", render: (r) => <span className="tabular-nums">{hrs(r.nightHours)}</span> },
    { key: "pay", header: "Extra pay", render: (r) => <span className="tabular-nums">{money(Number(r.overtimePay) + Number(r.premiumPay) + Number(r.nightPay) + Number(r.shiftAllowances), ccy(r.employeeId))}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={TIMESHEET_STATUS_VARIANT[r.status]}>{TIMESHEET_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries">Shifts</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="entries">
          <DataTable<EntryRow>
            endpoint="/api/attendance/entries"
            columns={entryColumns}
            searchPlaceholder="Search by employee"
            refreshKey={entryRefresh}
            toolbar={<Button onClick={() => setEntryOpen(true)}><Plus className="h-4 w-4" />Clock in</Button>}
            rowActions={(r) => <EntryActions row={r} onOpen={() => setEntryId(r.id)} onChange={() => setEntryRefresh((k) => k + 1)} />}
          />
        </TabsContent>

        <TabsContent value="roster">
          <RosterPanel lookups={lookups} />
        </TabsContent>

        <TabsContent value="timesheets">
          <DataTable<SheetRow>
            endpoint="/api/attendance/timesheets"
            columns={sheetColumns}
            searchPlaceholder="Search by employee or period"
            refreshKey={sheetRefresh}
            toolbar={<Button onClick={() => setBuildOpen(true)}><CalendarClock className="h-4 w-4" />Build timesheet</Button>}
            rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setSheetId(r.id)}>Open</Button>}
          />
        </TabsContent>

        <TabsContent value="settings">
          <TimeSettings onChanged={reloadLookups} />
        </TabsContent>
      </Tabs>

      {entryOpen && <EntryDialog lookups={lookups} onClose={() => setEntryOpen(false)} onSaved={() => setEntryRefresh((k) => k + 1)} />}
      {buildOpen && <BuildDialog lookups={lookups} onClose={() => setBuildOpen(false)} onSaved={() => setSheetRefresh((k) => k + 1)} />}
      {entryId && <EntryDetailDialog id={entryId} onClose={() => setEntryId(null)} onChange={() => setEntryRefresh((k) => k + 1)} />}
      {sheetId && <TimesheetDetail id={sheetId} currency={ccy} onClose={() => setSheetId(null)} onChange={refreshAll} />}
    </>
  );
}

function EntryActions({ row, onOpen, onChange }: { row: EntryRow; onOpen: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const locked = !!row.timesheetId;

  async function call(path: string, method: string, body: unknown, label: string) {
    setBusy(true);
    try {
      await apiFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      toast({ title: label, variant: "success" });
      onChange();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex gap-1">
      <Button variant="outline" size="sm" onClick={onOpen} title="Open"><Eye className="h-4 w-4" /></Button>
      {!locked && !row.clockOut && (
        <Button variant="outline" size="sm" disabled={busy} title="Clock out now"
          onClick={() => call(`/api/attendance/entries/${row.id}/clock-out`, "POST", { at: new Date().toISOString() }, "Clocked out")}>
          <LogOut className="h-4 w-4" />
        </Button>
      )}
      {!locked && (
        <Button variant="outline" size="sm" disabled={busy} title="Delete"
          onClick={() => call(`/api/attendance/entries/${row.id}`, "DELETE", undefined, "Entry deleted")}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
      {locked && <span className="self-center text-xs text-muted-foreground">locked</span>}
    </div>
  );
}

function EntryDialog({ lookups, onClose, onSaved }: { lookups: Lookups; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [workDate, setWorkDate] = useState(today());
  const [clockIn, setClockIn] = useState(nowLocalInput());
  const [clockOut, setClockOut] = useState("");
  const [source, setSource] = useState<AttendanceSource>("MANUAL");
  const [shiftCodeId, setShiftCodeId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (!employeeId) throw new ApiError("Select an employee", 422);
      const res = await apiFetch<{ holds: { reason: string; blocking: boolean }[]; lateMinutes: number }>("/api/attendance/entries", {
        method: "POST",
        body: JSON.stringify({
          employeeId, workDate, source,
          clockIn: localInputToIso(clockIn),
          clockOut: clockOut ? localInputToIso(clockOut) : null,
          shiftCodeId: shiftCodeId || null,
          vehicleId: vehicleId || null,
          clockInPlace: place || null,
        }),
      });
      const blocking = res.holds.filter((h) => h.blocking);
      if (blocking.length) {
        toast({ title: "Clocked in, but not clear to drive", description: blocking.map((h) => h.reason).join("; "), variant: "destructive" });
      } else {
        toast({ title: "Clocked in", description: res.lateMinutes > 0 ? `${res.lateMinutes} minutes after the scheduled start` : undefined, variant: "success" });
      }
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Clock in</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{lookups.employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} · {e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Work date</Label><Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Punch method</Label>
              <Select value={source} onValueChange={(v) => setSource(v as AttendanceSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ATTENDANCE_SOURCE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Clock in</Label><Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Clock out (if already done)</Label><Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Shift</Label>
              <Select value={shiftCodeId || "roster"} onValueChange={(v) => setShiftCodeId(v === "roster" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="roster">As rostered</SelectItem>
                  {lookups.shiftCodes.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} · {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle</Label>
              <Select value={vehicleId || "roster"} onValueChange={(v) => setVehicleId(v === "roster" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="roster">As rostered</SelectItem>
                  {lookups.vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicleNumber} · {v.plateNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Where</Label><Input placeholder="Dar depot, Tunduma yard" value={place} onChange={(e) => setPlace(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BuildDialog({ lookups, onClose, onSaved }: { lookups: Lookups; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState(thisMonth());
  const [overtimeRate, setOvertimeRate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (!employeeId) throw new ApiError("Select an employee", 422);
      const sheet = await apiFetch<SheetRow>("/api/attendance/timesheets/build", {
        method: "POST", body: JSON.stringify({ employeeId, period, overtimeRate: overtimeRate ? Number(overtimeRate) : null }),
      });
      toast({ title: "Timesheet built", description: `${hrs(sheet.regularHours)} regular, ${hrs(sheet.overtimeHours)} overtime, ${hrs(sheet.premiumHours)} premium`, variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Build timesheet</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Runs the period&#39;s completed shifts through the working-time policy: breaks off, daily and weekly overtime, rest-day and holiday premium, night hours and shift allowances, priced at the employee&#39;s hourly rate.</p>
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{lookups.employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} · {e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Period</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Overtime rate override (per hour)</Label><Input type="number" step="0.01" placeholder="Employee's own rate" value={overtimeRate} onChange={(e) => setOvertimeRate(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Build</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SheetDetailData = SheetRow & {
  entries: { id: string; workDate: string; clockIn: string; clockOut: string | null; hours: string; shiftCode: { code: string } | null }[];
};

function TimesheetDetail({ id, currency, onClose, onChange }: { id: string; currency: (employeeId: string) => string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [sheet, setSheet] = useState<SheetDetailData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setSheet(await apiFetch<SheetDetailData>(`/api/attendance/timesheets/${id}`)); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
  }, [id, toast]);
  useEffect(() => { load(); }, [load]);

  async function act(path: string, label: string, body?: unknown) {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/timesheets/${id}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      toast({ title: label, variant: "success" });
      onChange(); await load();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  const ccy = sheet ? currency(sheet.employeeId) : "TZS";
  const total = sheet ? Number(sheet.overtimePay) + Number(sheet.premiumPay) + Number(sheet.nightPay) + Number(sheet.shiftAllowances) : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{sheet ? `${sheet.employee.name} · ${sheet.period}` : "Loading…"}</DialogTitle></DialogHeader>
        {sheet && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Badge variant={TIMESHEET_STATUS_VARIANT[sheet.status]}>{TIMESHEET_STATUS_LABEL[sheet.status]}</Badge>
              <span className="text-muted-foreground">Hourly rate <span className="text-foreground tabular-nums">{money(sheet.hourlyRate, ccy)}</span></span>
              <span className="ml-auto font-semibold tabular-nums">Extra pay {money(total, ccy)}</span>
            </div>

            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-1 text-left">Element</th><th className="p-1 text-right">Hours</th><th className="p-1 text-right">Rate</th><th className="p-1 text-right">Pay</th></tr></thead>
              <tbody className="tabular-nums">
                <tr className="border-t"><td className="p-1">Regular</td><td className="p-1 text-right">{hrs(sheet.regularHours)}</td><td className="p-1 text-right text-muted-foreground">in basic pay</td><td className="p-1 text-right text-muted-foreground">-</td></tr>
                <tr className="border-t"><td className="p-1">Overtime</td><td className="p-1 text-right">{hrs(sheet.overtimeHours)}</td><td className="p-1 text-right">{money(sheet.overtimeRate, ccy)}</td><td className="p-1 text-right">{money(sheet.overtimePay, ccy)}</td></tr>
                <tr className="border-t"><td className="p-1">Rest day and holiday premium</td><td className="p-1 text-right">{hrs(sheet.premiumHours)}</td><td className="p-1 text-right text-muted-foreground">policy multiple</td><td className="p-1 text-right">{money(sheet.premiumPay, ccy)}</td></tr>
                <tr className="border-t"><td className="p-1">Night premium</td><td className="p-1 text-right">{hrs(sheet.nightHours)}</td><td className="p-1 text-right text-muted-foreground">policy %</td><td className="p-1 text-right">{money(sheet.nightPay, ccy)}</td></tr>
                <tr className="border-t"><td className="p-1">Shift allowances</td><td className="p-1 text-right text-muted-foreground">-</td><td className="p-1 text-right text-muted-foreground">per shift</td><td className="p-1 text-right">{money(sheet.shiftAllowances, ccy)}</td></tr>
                <tr className="border-t text-xs text-muted-foreground"><td className="p-1">Driving {hrs(sheet.drivingHours)} · Waiting {hrs(sheet.waitingHours)} · Breaks {hrs(sheet.breakHours)}</td><td colSpan={3} /></tr>
              </tbody>
            </table>

            <div className="max-h-60 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-elevated/80 text-[11px] uppercase text-muted-foreground">
                  <tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Shift</th><th className="p-2 text-left">In</th><th className="p-2 text-left">Out</th><th className="p-2 text-right">Hours</th></tr>
                </thead>
                <tbody>
                  {sheet.entries.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">No shifts in this period.</td></tr>}
                  {sheet.entries.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2">{e.workDate.slice(0, 10)}</td>
                      <td className="p-2 font-mono text-xs">{e.shiftCode?.code ?? ""}</td>
                      <td className="p-2 tabular-nums">{fmtTime(e.clockIn)}</td>
                      <td className="p-2 tabular-nums">{e.clockOut ? fmtTime(e.clockOut) : "open"}</td>
                      <td className="p-2 text-right tabular-nums">{e.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sheet.status === "APPROVED" && (
              <p className="text-sm text-muted-foreground">Approved. Overtime, premium, night and shift allowances go onto the {sheet.period} pay run as separate lines.</p>
            )}

            <DialogFooter className="gap-2">
              {sheet.status === "OPEN" && <Button variant="outline" disabled={busy} onClick={() => act("submit", "Submitted")}><Send className="h-4 w-4" />Submit</Button>}
              {sheet.status === "SUBMITTED" && (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => act("review", "Rejected", { approve: false })}><XCircle className="h-4 w-4" />Reject</Button>
                  <Button disabled={busy} onClick={() => act("review", "Approved", { approve: true })}><CheckCircle2 className="h-4 w-4" />Approve</Button>
                </>
              )}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
