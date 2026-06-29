"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@frontend/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { accountSchema, type AccountInput } from "@frontend/lib/validations";
import { ACCOUNT_TYPE_LABEL } from "@frontend/lib/labels";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import type { AccountType } from "@frontend/lib/enums";

interface Account extends AccountInput { id: string; }

const TYPES = Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[];

const columns: Column<Account>[] = [
  { key: "code", header: "Code", render: (r) => <span className="font-mono">{r.code}</span> },
  { key: "name", header: "Account Name" },
  { key: "type", header: "Type", render: (r) => <Badge variant="outline">{ACCOUNT_TYPE_LABEL[r.type as AccountType]}</Badge> },
  { key: "isActive", header: "Status", render: (r) => r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
];

export function AccountsManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const form = useForm<AccountInput>({ resolver: zodResolver(accountSchema) });

  function openCreate() {
    form.reset({ dataAreaId: "HQ01", code: "", name: "", type: "ASSET", isActive: true });
    setOpen(true);
  }

  async function onSubmit(data: AccountInput) {
    try {
      await apiFetch("/api/accounts", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "Account saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Account>
        endpoint="/api/accounts"
        columns={columns}
        searchPlaceholder="Search by code or name"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />Add Account</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Account Code</Label>
              <Input id="code" placeholder="e.g. 1000" {...form.register("code")} />
              {form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Account Name</Label>
              <Input id="name" placeholder="e.g. Cash on Hand" {...form.register("name")} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v as AccountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
