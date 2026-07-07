"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { ROLE_LABEL } from "@frontend/lib/labels";
import type { Role } from "@frontend/lib/enums";

interface User { id: string; name: string; email: string; role: Role; dataAreaId: string; isActive: boolean; }
type Company = { code: string; name: string };
type UserForm = { name: string; email: string; password: string; role: Role; dataAreaId: string };

export default function UsersPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const { register, handleSubmit, setValue, watch, reset, getValues, formState: { isSubmitting } } =
    useForm<UserForm>({ defaultValues: { role: "STAFF", dataAreaId: "HQ01" } });

  useEffect(() => {
    apiFetch<Company[]>("/api/lookups/companies").then(setCompanies).catch(() => {});
  }, []);

  const columns: Column<User>[] = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role", render: (r) => <Badge>{ROLE_LABEL[r.role]}</Badge> },
    { key: "dataAreaId", header: "Company", render: (r) => <span className="font-mono text-xs">{r.dataAreaId}</span> },
    { key: "isActive", header: "Status", render: (r) => r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
  ];

  async function onSubmit(data: UserForm) {
    try {
      await apiFetch("/api/users", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "User created", variant: "success" });
      setOpen(false); reset({ name: "", email: "", password: "", role: "STAFF", dataAreaId: "HQ01" }); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to create", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Users</h1>
      <DataTable<User>
        endpoint="/api/users" columns={columns} searchPlaceholder="Search by name or email" refreshKey={refreshKey}
        toolbar={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add User</Button>}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input {...register("name")} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" {...register("email")} /></div>
            <div className="space-y-1.5"><Label>Initial Password</Label><Input type="password" {...register("password")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select defaultValue={getValues("role")} onValueChange={(v) => setValue("role", v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ROLE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Select value={watch("dataAreaId")} onValueChange={(v) => setValue("dataAreaId", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{companies.map((co) => <SelectItem key={co.code} value={co.code}>{co.code} — {co.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button type="submit" disabled={isSubmitting}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
