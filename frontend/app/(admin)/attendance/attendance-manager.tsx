"use client";
import { useEffect, useState } from "react";
import { Plus, LogOut, Trash2, CalendarClock, Send, CheckCircle2, XCircle } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@frontend/components/ui/tabs";
import { useToast } from "@frontend/components/ui/toast";
import { ATTENDANCE_SOURCE_LABEL, TIMESHEET_STATUS_LABEL, TIMESHEET_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { AttendanceSource, TimesheetStatus } from "@frontend/lib/enums";

type EmployeeOpt = { id: string; code: string; name: string };
const money = (v: string) => `USD ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

interface EntryRow {
  id: string; workDate: string; clockIn: string; clockOut: string | null; hours: string;
  source: AttendanceSource; timesheetId: string | null;
  employee: { code: string; name: string };
}
interface SheetRow {
  id: string; period: string; status: TimesheetStatus;
  regularHours: string; overtimeHours: string; overtimePay: string;
  employee: { code: string; name: string };
}

export function AttendanceManager({ employees }: { employees: EmployeeOpt[] }) {
  const [entryRefresh, setEntryRefresh] = useState(0);
  const [sheetRefresh, setSheetRefresh] = useState(0);
  const [entryOpen, setEntryOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const refreshAll = () => { setEntryRefresh((k) => k + 1); setSheetRefresh((k) => k + 1); };

  const entryColumns: Column<EntryRow>[] = [
    { key: "employee", header: "Employee", render: (r) => <span>{r.employee.name} <span className="font-mono text-xs text-muted-foreground">{r.employee.code}</span></span> },
    { key: "workDate", header: "Date", render: (r) => r.workDate.slice(0, 10) },
    { key: "clockIn", header: "In", render: (r) => new Date(r.clockIn).toISOString().slice(11, 16) },
    { key: "clockOut", header: "Out", render: (r) => r.clockOut ? new Date(r.clockOut).toISOString().slice(11, 16) : <Badge variant="warning">Open</Badge> },
    { key: "hours", header: "Hours", render: (r) => <span className="tabular-nums">{r.hours}</span> },
    { key: "source", header: "Source", render: (r) => <span className="text-xs text-muted-foreground">{ATTENDANCE_SOURCE_LABEL[r.source]}</span> },
  ];

  const sheetColumns: Column<SheetRow>[] = [
    { key: "employee", header: "Employee", render: (r) => <span>{r.employee.name} <span className="font-mono text-xs text-muted-foreground">{r.employee.code}</span></span> },
    { key: "period", header: "Period", render: (r) => <span className="font-mono">{r.period}</span> },
    { key: "regularHours", header: "Regular", render: (r) => <span className="tabular-nums">{parseFloat(r.regularHours).toString()}</span> },
    { key: "overtimeHours", header: "OT hrs", render: (r) => <span className="tabular-nums">{parseFloat(r.overtimeHours).toString()}</span> },
    { key: "overtimePay", header: "OT pay", render: (r) => <span className="tabular-nums">{money(r.overtimePay)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={TIMESHEET_STATUS_VARIANT[r.status]}>{TIMESHEET_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries">Time Entries</TabsTrigger>
          <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
        </TabsList>

        <TabsContent value="entries">
          <DataTable<EntryRow>
            endpoint="/api/attendance/entries"
            columns={entryColumns}
            searchPlaceholder="Search by employee"
            refreshKey={entryRefresh}
            toolbar={<Button onClick={() => setEntryOpen(true)}><Plus className="h-4 w-4" />Record Entry</Button>}
            rowActions={(r) => <EntryActions row={r} onChange={() => setEntryRefresh((k) => k + 1)} />}
          />
        </TabsContent>

        <TabsContent value="timesheets">
          <DataTable<SheetRow>
            endpoint="/api/attendance/timesheets"
            columns={sheetColumns}
            searchPlaceholder="Search by employee or period"
            refreshKey={sheetRefresh}
            toolbar={<Button onClick={() => setBuildOpen(true)}><CalendarClock className="h-4 w-4" />Build Timesheet</Button>}
            rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>Open</Button>}
          />
        </TabsContent>
      </Tabs>

      {entryOpen && <EntryDialog employees={employees} onClose={() => setEntryOpen(false)} onSaved={() => setEntryRefresh((k) => k + 1)} />}
      {buildOpen && <BuildDialog employees={employees} onClose={() => setBuildOpen(false)} onSaved={() => setSheetRefresh((k) => k + 1)} />}
      {detailId && <TimesheetDetail id={detailId} onClose={() => setDetailId(null)} onChange={refreshAll} />}
    </>
  );
}

function EntryActions({ row, onChange }: { row: EntryRow; onChange: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const locked = !!row.timesheetId;

  async function doClockOut() {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/entries/${row.id}/clock-out`, { method: "POST", body: JSON.stringify({ at: new Date().toISOString() }) });
      toast({ title: "Clocked out", variant: "success" });
      onChange();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/entries/${row.id}`, { method: "DELETE" });
      toast({ title: "Entry deleted", variant: "success" });
      onChange();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  if (locked) return <span className="text-xs text-muted-foreground">locked</span>;
  return (
    <div className="flex gap-1">
      {!row.clockOut && <Button variant="outline" size="sm" disabled={busy} onClick={doClockOut}><LogOut className="h-4 w-4" /></Button>}
      <Button variant="outline" size="sm" disabled={busy} onClick={remove}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

function EntryDialog({ employees, onClose, onSaved }: { employees: EmployeeOpt[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [workDate, setWorkDate] = useState(today());
  const [clockIn, setClockIn] = useState(nowLocal());
  const [clockOut, setClockOut] = useState("");
  const [source, setSource] = useState<AttendanceSource>("MANUAL");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (!employeeId) throw new ApiError("Select an employee", 422);
      await apiFetch("/api/attendance/entries", {
        method: "POST",
        body: JSON.stringify({
          employeeId, workDate,
          clockIn: new Date(clockIn).toISOString(),
          clockOut: clockOut ? new Date(clockOut).toISOString() : null,
          source,
        }),
      });
      toast({ title: "Entry recorded", variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Time Entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Work date</Label><Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as AttendanceSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ATTENDANCE_SOURCE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Clock in</Label><Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Clock out (optional)</Label><Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BuildDialog({ employees, onClose, onSaved }: { employees: EmployeeOpt[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState(thisMonth());
  const [overtimeRate, setOvertimeRate] = useState("0");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (!employeeId) throw new ApiError("Select an employee", 422);
      const sheet = await apiFetch<{ regularHours: string; overtimeHours: string; overtimePay: string }>(
        "/api/attendance/timesheets/build",
        { method: "POST", body: JSON.stringify({ employeeId, period, overtimeRate: Number(overtimeRate) }) },
      );
      toast({ title: "Timesheet built", description: `${parseFloat(sheet.regularHours)}h regular + ${parseFloat(sheet.overtimeHours)}h OT`, variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Build Timesheet</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Sums the period's completed entries into regular + overtime hours (over 176h/mo is overtime), priced at the OT rate.</p>
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Period</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>OT rate (USD/hr)</Label><Input type="number" step="0.01" value={overtimeRate} onChange={(e) => setOvertimeRate(e.target.value)} /></div>
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

type SheetDetailData = {
  id: string; period: string; status: TimesheetStatus;
  regularHours: string; overtimeHours: string; overtimeRate: string; overtimePay: string;
  employee: { code: string; name: string };
  entries: { id: string; workDate: string; clockIn: string; clockOut: string | null; hours: string }[];
};

function TimesheetDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [sheet, setSheet] = useState<SheetDetailData | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setSheet(await apiFetch<SheetDetailData>(`/api/attendance/timesheets/${id}`)); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function act(path: string, label: string, body?: unknown) {
    setBusy(true);
    try {
      await apiFetch(`/api/attendance/timesheets/${id}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      toast({ title: label, variant: "success" });
      onChange(); await load();
    } catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{sheet ? `${sheet.employee.name} — ${sheet.period}` : "Loading…"}</DialogTitle></DialogHeader>
        {sheet && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={TIMESHEET_STATUS_VARIANT[sheet.status]}>{TIMESHEET_STATUS_LABEL[sheet.status]}</Badge>
              <span className="text-muted-foreground">Regular <span className="text-foreground tabular-nums">{parseFloat(sheet.regularHours)}h</span></span>
              <span className="text-muted-foreground">Overtime <span className="text-foreground tabular-nums">{parseFloat(sheet.overtimeHours)}h</span> @ {money(sheet.overtimeRate)}</span>
              <span className="ml-auto font-semibold tabular-nums">OT pay {money(sheet.overtimePay)}</span>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-elevated/80 text-[11px] uppercase text-muted-foreground">
                  <tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">In</th><th className="p-2 text-left">Out</th><th className="p-2 text-right">Hours</th></tr>
                </thead>
                <tbody>
                  {sheet.entries.length === 0 && <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No entries in this period.</td></tr>}
                  {sheet.entries.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2">{e.workDate.slice(0, 10)}</td>
                      <td className="p-2">{new Date(e.clockIn).toISOString().slice(11, 16)}</td>
                      <td className="p-2">{e.clockOut ? new Date(e.clockOut).toISOString().slice(11, 16) : "—"}</td>
                      <td className="p-2 text-right tabular-nums">{e.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sheet.status === "APPROVED" && (
              <p className="text-sm text-muted-foreground">Approved — this timesheet's overtime pay is added to the employee's gross on the {sheet.period} pay run.</p>
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
