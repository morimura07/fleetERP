"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Play, CheckCircle2, BookText } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
import { Badge } from "@frontend/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@frontend/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import { employeeSchema, type EmployeeInput } from "@frontend/lib/validations";
import {
  EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_VARIANT, PAYRUN_STATUS_LABEL, PAYRUN_STATUS_VARIANT,
  PAY_FREQUENCY_OPTIONS, EMPLOYMENT_TYPE_OPTIONS,
} from "@frontend/lib/labels";
import { OptionSelect } from "@frontend/components/ui/option-select";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { EmployeeStatus, PayRunStatus } from "@frontend/lib/enums";

interface Employee extends EmployeeInput { id: string; version: number; }
interface PayRun {
  id: string; year: number; month: number; status: PayRunStatus; currency: string;
  grossTotal: string; payeTotal: string; nssfTotal: string; shifTotal: string; netTotal: string;
}

const money = (v: string, c = "USD") => `${c} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const COUNTRIES = ["TZ", "KE", "UG", "RW", "ZM"];

export function PayrollManager() {
  return (
    <Tabs defaultValue="employees">
      <TabsList>
        <TabsTrigger value="employees">Employees</TabsTrigger>
        <TabsTrigger value="runs">Pay Runs</TabsTrigger>
      </TabsList>
      <TabsContent value="employees" className="mt-4"><EmployeesTab /></TabsContent>
      <TabsContent value="runs" className="mt-4"><PayRunsTab /></TabsContent>
    </Tabs>
  );
}

function EmployeesTab() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<EmployeeInput>({ resolver: zodResolver(employeeSchema) });

  function openCreate() {
    form.reset({ dataAreaId: "HQ01", code: "", name: "", country: "TZ", grossSalary: 0, currency: "USD", status: "ACTIVE", hiredAt: new Date() as unknown as Date, perDiem: 0, overnightAllowance: 0, phoneAllowance: 0, otherAllowance: 0 });
    setOpen(true);
  }

  async function onSubmit(data: EmployeeInput) {
    try {
      await apiFetch("/api/payroll/employees", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Employee saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  const columns: Column<Employee>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "country", header: "Country" },
    { key: "grossSalary", header: "Gross", render: (r) => <span className="tabular-nums">{money(String(r.grossSalary), r.currency)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={EMPLOYEE_STATUS_VARIANT[r.status as EmployeeStatus]}>{EMPLOYEE_STATUS_LABEL[r.status as EmployeeStatus]}</Badge> },
  ];

  return (
    <>
      <DataTable<Employee>
        endpoint="/api/payroll/employees"
        columns={columns}
        searchPlaceholder="Search by code or name"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Employee</Button>}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Employee</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Code</Label><Input placeholder="EMP-001" {...form.register("code")} />{form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}</div>
              <div className="space-y-1.5"><Label>Name</Label><Input {...form.register("name")} />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
              <div className="space-y-1.5">
                <Label>Country (statutory scheme)</Label>
                <Select value={form.watch("country")} onValueChange={(v) => form.setValue("country", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COUNTRIES.map((cc) => <SelectItem key={cc} value={cc}>{cc}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Gross Salary (monthly)</Label><Input type="number" step="0.01" {...form.register("grossSalary")} />{form.formState.errors.grossSalary && <p className="text-xs text-destructive">{form.formState.errors.grossSalary.message}</p>}</div>
              <div className="space-y-1.5"><Label>Currency</Label><CurrencySelect value={form.watch("currency")} onChange={(v) => form.setValue("currency", v)} /></div>
              <div className="space-y-1.5"><Label>Hired At</Label><Input type="date" {...form.register("hiredAt")} /></div>
              <div className="space-y-1.5"><Label>National ID</Label><Input {...form.register("nationalId")} /></div>
              <div className="space-y-1.5"><Label>TIN</Label><Input {...form.register("tin")} /></div>
            </div>

            <FormSection title="Role & Master Data">
              <div className="space-y-1.5"><Label>Job Title</Label><Input placeholder="Long-Haul Driver…" {...form.register("jobTitle")} /></div>
              <div className="space-y-1.5"><Label>Employment Type</Label><OptionSelect value={form.watch("employmentType")} onChange={(v) => form.setValue("employmentType", v)} options={EMPLOYMENT_TYPE_OPTIONS} /></div>
              <div className="space-y-1.5"><Label>Department</Label><Input {...form.register("department")} /></div>
              <div className="space-y-1.5"><Label>Cost Center</Label><Input {...form.register("costCenter")} /></div>
              <div className="space-y-1.5"><Label>Pay Frequency</Label><OptionSelect value={form.watch("payFrequency")} onChange={(v) => form.setValue("payFrequency", v)} options={PAY_FREQUENCY_OPTIONS} /></div>
              <div className="space-y-1.5"><Label>NSSF Number</Label><Input {...form.register("nssfNumber")} /></div>
              <div className="space-y-1.5"><Label>SHIF Number</Label><Input {...form.register("shifNumber")} /></div>
            </FormSection>

            <FormSection title="Standing Allowances">
              <div className="space-y-1.5"><Label>Per Diem</Label><Input type="number" step="0.01" {...form.register("perDiem")} /></div>
              <div className="space-y-1.5"><Label>Overnight Allowance</Label><Input type="number" step="0.01" {...form.register("overnightAllowance")} /></div>
              <div className="space-y-1.5"><Label>Phone Allowance</Label><Input type="number" step="0.01" {...form.register("phoneAllowance")} /></div>
              <div className="space-y-1.5"><Label>Other Allowance</Label><Input type="number" step="0.01" {...form.register("otherAllowance")} /></div>
            </FormSection>

            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PayRunsTab() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function compute() {
    setBusy(true);
    try {
      await apiFetch("/api/payroll/runs", { method: "POST", body: JSON.stringify({ year, month }) });
      toast({ title: `Pay run ${year}-${month} computed`, variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  const columns: Column<PayRun>[] = [
    { key: "period", header: "Period", render: (r) => `${r.year}-${String(r.month).padStart(2, "0")}` },
    { key: "grossTotal", header: "Gross", render: (r) => <span className="tabular-nums">{money(r.grossTotal, r.currency)}</span> },
    { key: "payeTotal", header: "PAYE", render: (r) => <span className="tabular-nums">{money(r.payeTotal, r.currency)}</span> },
    { key: "netTotal", header: "Net", render: (r) => <span className="font-semibold tabular-nums">{money(r.netTotal, r.currency)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={PAYRUN_STATUS_VARIANT[r.status]}>{PAYRUN_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<PayRun>
        endpoint="/api/payroll/runs"
        columns={columns}
        refreshKey={refreshKey}
        toolbar={
          <div className="flex items-center gap-2">
            <Input type="number" className="w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            <Input type="number" className="w-16" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} />
            <Button onClick={compute} disabled={busy}><Play className="h-4 w-4" />Compute</Button>
          </div>
        }
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>Open</Button>}
      />
      {detailId && <PayRunDetail id={detailId} onClose={() => setDetailId(null)} onChange={() => setRefreshKey((k) => k + 1)} />}
    </>
  );
}

type PayRunDetailData = PayRun & {
  postingEntryId: string | null;
  payslips: { id: string; gross: string; paye: string; nssf: string; shif: string; net: string; employee: { code: string; name: string } }[];
};

function PayRunDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [run, setRun] = useState<PayRunDetailData | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setRun(await apiFetch<PayRunDetailData>(`/api/payroll/runs/${id}`)); }
    catch (e) { toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" }); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function act(path: string, label: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/payroll/runs/${id}/${path}`, { method: "POST" });
      toast({ title: label, variant: "success" });
      onChange();
      await load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{run ? `Payroll ${run.year}-${String(run.month).padStart(2, "0")}` : "Loading…"}</DialogTitle></DialogHeader>
        {run && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant={PAYRUN_STATUS_VARIANT[run.status]}>{PAYRUN_STATUS_LABEL[run.status]}</Badge>
              <span className="ml-auto text-sm text-muted-foreground">Net payable: <span className="font-semibold text-foreground tabular-nums">{money(run.netTotal, run.currency)}</span></span>
            </div>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-elevated/50 text-[11px] uppercase text-muted-foreground">
                  <tr><th className="p-2 text-left">Employee</th><th className="p-2 text-right">Gross</th><th className="p-2 text-right">PAYE</th><th className="p-2 text-right">NSSF</th><th className="p-2 text-right">SHIF</th><th className="p-2 text-right">Net</th></tr>
                </thead>
                <tbody>
                  {run.payslips.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.employee.name} <span className="font-mono text-xs text-muted-foreground">{s.employee.code}</span></td>
                      <td className="p-2 text-right tabular-nums">{parseFloat(s.gross).toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums">{parseFloat(s.paye).toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums">{parseFloat(s.nssf).toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums">{parseFloat(s.shif).toFixed(2)}</td>
                      <td className="p-2 text-right font-semibold tabular-nums">{parseFloat(s.net).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter className="gap-2">
              {run.status === "DRAFT" && <Button variant="outline" disabled={busy} onClick={() => act("approve", "Approved")}><CheckCircle2 className="h-4 w-4" />Approve</Button>}
              {run.status === "APPROVED" && <Button disabled={busy} onClick={() => act("post", "Posted to ledger")}><BookText className="h-4 w-4" />Post to ledger</Button>}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
