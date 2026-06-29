"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, CheckCircle2 } from "lucide-react";
import { DataTable, type Column } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  bankAccountSchema, type BankAccountInput,
  moneyTransferSchema, type MoneyTransferInput,
} from "@/lib/validations";
import {
  BANK_ACCOUNT_TYPE_LABEL, DISBURSEMENT_TYPE_LABEL,
  TRANSFER_STATUS_LABEL, TRANSFER_STATUS_VARIANT,
} from "@/lib/labels";
import { apiFetch, ApiError } from "@/lib/fetcher";
import type { BankAccountType, DisbursementType, TransferStatus } from "@prisma/client";

interface BankAccount extends BankAccountInput { id: string; }
interface Transfer {
  id: string; reference: string; amount: string; currency: string;
  type: DisbursementType; status: TransferStatus; transferredAt: string;
  bankAccount?: { code: string; name: string; type: string };
  driver?: { name: string } | null;
}

const ACCOUNT_TYPES = Object.keys(BANK_ACCOUNT_TYPE_LABEL) as BankAccountType[];
const DISBURSE_TYPES = Object.keys(DISBURSEMENT_TYPE_LABEL) as DisbursementType[];

const fmtDate = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

// ───────── Accounts tab ─────────
function AccountsTab() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const form = useForm<BankAccountInput>({ resolver: zodResolver(bankAccountSchema) });

  function openCreate() {
    form.reset({ dataAreaId: "HQ01", code: "", name: "", type: "BANK", glCode: "1010", currency: "USD", isActive: true });
    setOpen(true);
  }
  async function onSubmit(data: BankAccountInput) {
    try {
      await apiFetch("/api/bank", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Account saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  const columns: Column<BankAccount>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "type", header: "Type", render: (r) => <Badge variant="outline">{BANK_ACCOUNT_TYPE_LABEL[r.type as BankAccountType]}</Badge> },
    { key: "glCode", header: "GL Account", render: (r) => <span className="font-mono">{r.glCode}</span> },
    { key: "currency", header: "Currency" },
    { key: "provider", header: "Provider", render: (r) => r.provider || "—" },
  ];

  return (
    <>
      <DataTable<BankAccount>
        endpoint="/api/bank"
        columns={columns}
        searchPlaceholder="Search by code or name"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Account</Button>}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Cash / Bank Account</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input placeholder="BANK-CRDB-USD" {...form.register("code")} />
                {form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input placeholder="CRDB — Main USD" {...form.register("name")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as BankAccountType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{BANK_ACCOUNT_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>GL Account Code</Label>
                <Input placeholder="1010" {...form.register("glCode")} />
                {form.formState.errors.glCode && <p className="text-xs text-destructive">{form.formState.errors.glCode.message}</p>}
              </div>
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} {...form.register("currency")} /></div>
              <div className="space-y-1.5"><Label>Provider</Label><Input placeholder="Safaricom / CRDB" {...form.register("provider")} /></div>
              <div className="space-y-1.5"><Label>IBAN</Label><Input {...form.register("iban")} /></div>
              <div className="space-y-1.5"><Label>SWIFT</Label><Input {...form.register("swift")} /></div>
              <div className="space-y-1.5"><Label>Account / MSISDN</Label><Input {...form.register("accountNo")} /></div>
            </div>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────── Transfers tab ─────────
function TransfersTab() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const form = useForm<MoneyTransferInput>({ resolver: zodResolver(moneyTransferSchema) });

  async function openCreate() {
    form.reset({ dataAreaId: "HQ01", reference: "", bankAccountId: "", type: "FUEL_ALLOWANCE", amount: "", currency: "USD", expenseCode: "5030", transferredAt: new Date(), post: false });
    try {
      const data = await apiFetch<{ id: string; code: string; name: string }[]>("/api/bank?pageSize=100");
      setAccounts(data);
    } catch { /* ignore */ }
    setOpen(true);
  }

  async function onSubmit(data: MoneyTransferInput) {
    try {
      await apiFetch("/api/bank/transfers", { method: "POST", body: JSON.stringify(data) });
      toast({ title: data.post ? "Disbursement settled" : "Disbursement recorded", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function settle(id: string) {
    try {
      await apiFetch(`/api/bank/transfers/${id}`, { method: "POST", body: JSON.stringify({ action: "settle" }) });
      toast({ title: "Settled to ledger", variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to settle", variant: "destructive" });
    }
  }

  const columns: Column<Transfer>[] = [
    { key: "reference", header: "Reference", render: (r) => <span className="font-mono">{r.reference}</span> },
    { key: "bankAccount", header: "Account", render: (r) => r.bankAccount?.code ?? "—" },
    { key: "driver", header: "Driver", render: (r) => r.driver?.name ?? "—" },
    { key: "type", header: "Type", render: (r) => DISBURSEMENT_TYPE_LABEL[r.type] },
    { key: "amount", header: "Amount", render: (r) => <span className="tabular-nums">{r.currency} {parseFloat(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> },
    { key: "transferredAt", header: "Date", render: (r) => <span className="tabular-nums">{fmtDate(r.transferredAt)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={TRANSFER_STATUS_VARIANT[r.status]}>{TRANSFER_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<Transfer>
        endpoint="/api/bank/transfers"
        columns={columns}
        searchPlaceholder="Search by reference or driver"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Disbursement</Button>}
        rowActions={(r) => r.status === "PENDING" ? (
          <Button variant="outline" size="sm" onClick={() => settle(r.id)}><CheckCircle2 className="h-4 w-4" />Settle</Button>
        ) : null}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Driver Disbursement</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input placeholder="MM-2026-0001" {...form.register("reference")} />
                {form.formState.errors.reference && <p className="text-xs text-destructive">{form.formState.errors.reference.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>From Account</Label>
                <Select value={form.watch("bankAccountId")} onValueChange={(v) => form.setValue("bankAccountId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                </Select>
                {form.formState.errors.bankAccountId && <p className="text-xs text-destructive">Account is required</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as DisbursementType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DISBURSE_TYPES.map((t) => <SelectItem key={t} value={t}>{DISBURSEMENT_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input placeholder="500.00" {...form.register("amount")} />
                {form.formState.errors.amount && <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>}
              </div>
              <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} {...form.register("currency")} /></div>
              <div className="space-y-1.5"><Label>Expense GL Code</Label><Input placeholder="5030" {...form.register("expenseCode")} /></div>
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" {...form.register("transferredAt")} /></div>
              <div className="space-y-1.5"><Label>External Ref (M-Pesa/Airtel)</Label><Input {...form.register("externalRef")} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("post")} className="h-4 w-4 rounded border-border" />
              Settle to the ledger immediately (mark SUCCESS)
            </label>
            <DialogFooter><Button type="submit" disabled={form.formState.isSubmitting}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BankManager() {
  return (
    <Tabs defaultValue="accounts">
      <TabsList>
        <TabsTrigger value="accounts">Accounts</TabsTrigger>
        <TabsTrigger value="transfers">Disbursements</TabsTrigger>
      </TabsList>
      <TabsContent value="accounts"><AccountsTab /></TabsContent>
      <TabsContent value="transfers"><TransfersTab /></TabsContent>
    </Tabs>
  );
}
