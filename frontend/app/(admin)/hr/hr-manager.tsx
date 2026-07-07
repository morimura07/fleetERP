"use client";
import { useEffect, useState } from "react";
import { Plus, CheckCircle2, XCircle, FileText, CalendarDays } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@frontend/components/ui/tabs";
import { useToast } from "@frontend/components/ui/toast";
import {
  EMPLOYMENT_TYPE_LABEL, CONTRACT_STATUS_LABEL, CONTRACT_STATUS_VARIANT,
  LEAVE_TYPE_LABEL, LEAVE_STATUS_LABEL, LEAVE_STATUS_VARIANT, EMPLOYEE_DOC_LABEL,
} from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type {
  EmploymentType, ContractStatus, LeaveType, LeaveStatus, EmployeeDocType,
} from "@frontend/lib/enums";

type EmployeeOpt = { id: string; code: string; name: string };
const money = (v: string, c = "USD") => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

interface EmployeeRow {
  id: string; code: string; name: string; status: "ACTIVE" | "ON_LEAVE" | "TERMINATED";
  grossSalary: string; currency: string;
  activeContract: { title: string; type: EmploymentType } | null;
}
const EMP_STATUS_VARIANT = { ACTIVE: "success", ON_LEAVE: "warning", TERMINATED: "secondary" } as const;

interface LeaveRow {
  id: string; type: LeaveType; status: LeaveStatus; days: number;
  startDate: string; endDate: string;
  employee: { code: string; name: string };
}

export function HrManager({ employees }: { employees: EmployeeOpt[] }) {
  const [empRefresh, setEmpRefresh] = useState(0);
  const [leaveRefresh, setLeaveRefresh] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const empColumns: Column<EmployeeRow>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "activeContract", header: "Position", render: (r) => r.activeContract ? `${r.activeContract.title}` : <span className="text-muted-foreground">—</span> },
    { key: "grossSalary", header: "Gross", render: (r) => <span className="tabular-nums">{money(r.grossSalary, r.currency)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={EMP_STATUS_VARIANT[r.status]}>{r.status === "ON_LEAVE" ? "On leave" : r.status[0] + r.status.slice(1).toLowerCase()}</Badge> },
  ];

  const leaveColumns: Column<LeaveRow>[] = [
    { key: "employee", header: "Employee", render: (r) => <span>{r.employee.name} <span className="text-muted-foreground font-mono text-xs">{r.employee.code}</span></span> },
    { key: "type", header: "Type", render: (r) => LEAVE_TYPE_LABEL[r.type] },
    { key: "startDate", header: "From", render: (r) => r.startDate.slice(0, 10) },
    { key: "endDate", header: "To", render: (r) => r.endDate.slice(0, 10) },
    { key: "days", header: "Days", render: (r) => <span className="tabular-nums">{r.days}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={LEAVE_STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="leave">Leave Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="employees">
          <DataTable<EmployeeRow>
            endpoint="/api/hr/employees"
            columns={empColumns}
            searchPlaceholder="Search by code or name"
            refreshKey={empRefresh}
            rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>Open</Button>}
          />
        </TabsContent>
        <TabsContent value="leave">
          <DataTable<LeaveRow>
            endpoint="/api/hr/leave"
            columns={leaveColumns}
            searchPlaceholder="Search by employee"
            refreshKey={leaveRefresh}
            toolbar={<Button onClick={() => setLeaveOpen(true)}><Plus className="h-4 w-4" />New Leave Request</Button>}
            rowActions={(r) => r.status === "PENDING" ? <ReviewButtons id={r.id} onChange={() => setLeaveRefresh((k) => k + 1)} /> : null}
          />
        </TabsContent>
      </Tabs>

      {leaveOpen && <LeaveDialog employees={employees} onClose={() => setLeaveOpen(false)} onSaved={() => setLeaveRefresh((k) => k + 1)} />}
      {detailId && <EmployeeDetail id={detailId} onClose={() => setDetailId(null)} onChange={() => { setEmpRefresh((k) => k + 1); setLeaveRefresh((k) => k + 1); }} />}
    </>
  );
}

function ReviewButtons({ id, onChange }: { id: string; onChange: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function review(approve: boolean) {
    setBusy(true);
    try {
      await apiFetch(`/api/hr/leave/${id}/review`, { method: "POST", body: JSON.stringify({ approve }) });
      toast({ title: approve ? "Leave approved" : "Leave rejected", variant: "success" });
      onChange();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }
  return (
    <div className="flex gap-1">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => review(true)}><CheckCircle2 className="h-4 w-4" /></Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => review(false)}><XCircle className="h-4 w-4" /></Button>
    </div>
  );
}

function LeaveDialog({ employees, employeeId: fixedEmp, onClose, onSaved }: { employees: EmployeeOpt[]; employeeId?: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState(fixedEmp ?? "");
  const [type, setType] = useState<LeaveType>("ANNUAL");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (!employeeId) throw new ApiError("Select an employee", 422);
      await apiFetch("/api/hr/leave", { method: "POST", body: JSON.stringify({ employeeId, type, startDate, endDate, reason: reason || null }) });
      toast({ title: "Leave request submitted", variant: "success" });
      onSaved(); onClose();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!fixedEmp && (
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LEAVE_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>From</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>To</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Employee detail ───────────────────────────────────────────────────────────

type Contract = { id: string; type: EmploymentType; status: ContractStatus; title: string; grossSalary: string; currency: string; startDate: string; endDate: string | null };
type Leave = { id: string; type: LeaveType; status: LeaveStatus; days: number; startDate: string; endDate: string; reason: string | null };
type Balance = { id: string; type: LeaveType; year: number; entitled: number; taken: number; remaining: number };
type Doc = { id: string; type: EmployeeDocType; number: string | null; issuedAt: string | null; expiresAt: string | null };
type EmployeeDetailData = {
  id: string; code: string; name: string; status: "ACTIVE" | "ON_LEAVE" | "TERMINATED";
  grossSalary: string; currency: string; hiredAt: string;
  contracts: Contract[]; leaveRequests: Leave[]; leaveBalances: Balance[]; documents: Doc[];
};

function EmployeeDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [emp, setEmp] = useState<EmployeeDetailData | null>(null);
  const [busy, setBusy] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [entitleOpen, setEntitleOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  async function load() {
    try { setEmp(await apiFetch<EmployeeDetailData>(`/api/hr/employees/${id}`)); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function act(path: string, label: string, body?: unknown) {
    setBusy(true);
    try {
      await apiFetch(`/api/hr${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      toast({ title: label, variant: "success" });
      onChange(); await load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const reload = () => { onChange(); load(); };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{emp ? `${emp.code} — ${emp.name}` : "Loading…"}</DialogTitle></DialogHeader>
        {emp && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={EMP_STATUS_VARIANT[emp.status]}>{emp.status === "ON_LEAVE" ? "On leave" : emp.status[0] + emp.status.slice(1).toLowerCase()}</Badge>
              <span className="text-muted-foreground">Hired {emp.hiredAt.slice(0, 10)}</span>
              <span className="ml-auto font-semibold tabular-nums">{money(emp.grossSalary, emp.currency)}/mo</span>
            </div>

            <Tabs defaultValue="contracts">
              <TabsList>
                <TabsTrigger value="contracts">Contracts</TabsTrigger>
                <TabsTrigger value="leave">Leave</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>

              {/* Contracts */}
              <TabsContent value="contracts" className="space-y-2">
                <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setContractOpen(true)}><Plus className="h-3.5 w-3.5" />Add contract</Button></div>
                <SimpleTable
                  head={["Title", "Type", "From", "To", "Gross", "Status", ""]}
                  rows={emp.contracts.map((c) => [
                    c.title, EMPLOYMENT_TYPE_LABEL[c.type], c.startDate.slice(0, 10), c.endDate?.slice(0, 10) ?? "—",
                    money(c.grossSalary, c.currency),
                    <Badge key="s" variant={CONTRACT_STATUS_VARIANT[c.status]}>{CONTRACT_STATUS_LABEL[c.status]}</Badge>,
                    c.status === "DRAFT" ? <Button key="a" size="sm" variant="outline" disabled={busy} onClick={() => act(`/contracts/${c.id}/activate`, "Contract activated")}>Activate</Button>
                      : c.status === "ACTIVE" ? <Button key="e" size="sm" variant="outline" disabled={busy} onClick={() => act(`/contracts/${c.id}/end`, "Contract ended")}>End</Button> : null,
                  ])}
                  empty="No contracts."
                />
              </TabsContent>

              {/* Leave */}
              <TabsContent value="leave" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase text-muted-foreground">Balances</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEntitleOpen(true)}><CalendarDays className="h-3.5 w-3.5" />Set entitlement</Button>
                    <Button size="sm" variant="outline" onClick={() => setLeaveOpen(true)}><Plus className="h-3.5 w-3.5" />Request leave</Button>
                  </div>
                </div>
                <SimpleTable
                  head={["Type", "Year", "Entitled", "Taken", "Remaining"]}
                  rows={emp.leaveBalances.map((b) => [LEAVE_TYPE_LABEL[b.type], String(b.year), String(b.entitled), String(b.taken), <span key="r" className="font-medium">{b.remaining}</span>])}
                  empty="No balances set."
                />
                <div className="text-[11px] font-semibold uppercase text-muted-foreground">Requests</div>
                <SimpleTable
                  head={["Type", "From", "To", "Days", "Status", ""]}
                  rows={emp.leaveRequests.map((l) => [
                    LEAVE_TYPE_LABEL[l.type], l.startDate.slice(0, 10), l.endDate.slice(0, 10), String(l.days),
                    <Badge key="s" variant={LEAVE_STATUS_VARIANT[l.status]}>{LEAVE_STATUS_LABEL[l.status]}</Badge>,
                    (l.status === "PENDING" || l.status === "APPROVED")
                      ? <Button key="c" size="sm" variant="outline" disabled={busy} onClick={() => act(`/leave/${l.id}/cancel`, "Leave cancelled")}>Cancel</Button> : null,
                  ])}
                  empty="No leave requests."
                />
              </TabsContent>

              {/* Documents */}
              <TabsContent value="documents" className="space-y-2">
                <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setDocOpen(true)}><FileText className="h-3.5 w-3.5" />Add / update document</Button></div>
                <SimpleTable
                  head={["Type", "Number", "Issued", "Expires"]}
                  rows={emp.documents.map((d) => {
                    const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
                    const soon = d.expiresAt && !expired && new Date(d.expiresAt) < new Date(Date.now() + 14 * 86400000);
                    return [
                      EMPLOYEE_DOC_LABEL[d.type], d.number ?? "—", d.issuedAt?.slice(0, 10) ?? "—",
                      d.expiresAt ? <span key="e" className={expired ? "text-red-400" : soon ? "text-amber-400" : ""}>{d.expiresAt.slice(0, 10)}</span> : "—",
                    ];
                  })}
                  empty="No documents."
                />
              </TabsContent>
            </Tabs>

            <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
          </div>
        )}
      </DialogContent>

      {contractOpen && emp && <ContractDialog employeeId={emp.id} onClose={() => setContractOpen(false)} onSaved={reload} />}
      {entitleOpen && emp && <EntitlementDialog employeeId={emp.id} onClose={() => setEntitleOpen(false)} onSaved={reload} />}
      {docOpen && emp && <DocDialog employeeId={emp.id} onClose={() => setDocOpen(false)} onSaved={reload} />}
      {leaveOpen && emp && <LeaveDialog employees={[{ id: emp.id, code: emp.code, name: emp.name }]} employeeId={emp.id} onClose={() => setLeaveOpen(false)} onSaved={reload} />}
    </Dialog>
  );
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-elevated/50 text-[11px] uppercase text-muted-foreground">
          <tr>{head.map((h, i) => <th key={i} className="p-2 text-left">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="p-3 text-center text-muted-foreground">{empty}</td></tr>}
          {rows.map((r, i) => <tr key={i} className="border-t">{r.map((cell, j) => <td key={j} className="p-2">{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function ContractDialog({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState<EmploymentType>("PERMANENT");
  const [title, setTitle] = useState("");
  const [grossSalary, setGrossSalary] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const needsEnd = type === "FIXED_TERM" || type === "PROBATION";

  async function submit() {
    setBusy(true);
    try {
      if (!title.trim()) throw new ApiError("Job title is required", 422);
      if (needsEnd && !endDate) throw new ApiError("This contract type needs an end date", 422);
      await apiFetch("/api/hr/contracts", { method: "POST", body: JSON.stringify({ employeeId, type, title, grossSalary: Number(grossSalary), startDate, endDate: endDate || null }) });
      toast({ title: "Contract created", variant: "success" });
      onSaved(); onClose();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Employment Contract</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as EmploymentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(EMPLOYMENT_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Monthly gross</Label><Input type="number" step="0.01" value={grossSalary} onChange={(e) => setGrossSalary(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Job title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Long-haul driver, Workshop foreman…" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Start date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>End date {needsEnd ? "" : "(optional)"}</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntitlementDialog({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState<LeaveType>("ANNUAL");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [entitled, setEntitled] = useState("21");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await apiFetch(`/api/hr/employees/${employeeId}/entitlement`, { method: "POST", body: JSON.stringify({ type, year: Number(year), entitled: Number(entitled) }) });
      toast({ title: "Entitlement set", variant: "success" });
      onSaved(); onClose();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Set Leave Entitlement</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(LEAVE_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Days</Label><Input type="number" value={entitled} onChange={(e) => setEntitled(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocDialog({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState<EmployeeDocType>("CONTRACT");
  const [num, setNum] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await apiFetch(`/api/hr/employees/${employeeId}/documents`, {
        method: "POST",
        body: JSON.stringify({ type, number: num || null, issuedAt: issuedAt || null, expiresAt: expiresAt || null }),
      });
      toast({ title: "Document saved", variant: "success" });
      onSaved(); onClose();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Employee Document</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as EmployeeDocType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(EMPLOYEE_DOC_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Number</Label><Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="Optional" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Issued</Label><Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Expires</Label><Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div>
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
