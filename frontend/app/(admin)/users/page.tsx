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
import { FormSection } from "@frontend/components/ui/form-section";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { ROLE_LABEL } from "@frontend/lib/labels";
import type { Role } from "@frontend/lib/enums";

interface User { id: string; name: string; email: string; role: Role; roleKey: string | null; dataAreaId: string; isActive: boolean; }
type Company = { code: string; name: string };
type RoleOption = { key: string; name: string; isSystem: boolean };
type UserForm = {
  name: string; email: string; password: string; role: Role; dataAreaId: string;
  phone?: string; jobTitle?: string; assignedBranch?: string; costCenter?: string;
  approvalLimit?: string; esignatory?: boolean; languagePref?: string; timeZone?: string;
};

export default function UsersPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [assignFor, setAssignFor] = useState<User | null>(null);
  const { register, handleSubmit, setValue, watch, reset, getValues, formState: { isSubmitting } } =
    useForm<UserForm>({ defaultValues: { role: "STAFF", dataAreaId: "HQ01" } });

  useEffect(() => {
    apiFetch<Company[]>("/api/lookups/companies").then(setCompanies).catch(() => {});
    apiFetch<RoleOption[]>("/api/rbac/roles").then(setRoles).catch(() => {});
  }, []);

  const customRoles = roles.filter((r) => !r.isSystem);
  const roleName = (key: string | null) => key ? (roles.find((r) => r.key === key)?.name ?? key) : null;

  const columns: Column<User>[] = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role", render: (r) => (
      r.roleKey
        ? <Badge variant="outline">{roleName(r.roleKey)}</Badge>
        : <Badge>{ROLE_LABEL[r.role]}</Badge>
    ) },
    { key: "dataAreaId", header: "Company", render: (r) => <span className="font-mono text-xs">{r.dataAreaId}</span> },
    { key: "isActive", header: "Status", render: (r) => r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
  ];

  async function assignRole(user: User, roleKey: string | null) {
    try {
      await apiFetch(`/api/rbac/users/${user.id}/role`, { method: "POST", body: JSON.stringify({ roleKey }) });
      toast({ title: roleKey ? `Assigned ${roleName(roleKey)}` : "Reverted to system role", variant: "success" });
      setAssignFor(null); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  async function onSubmit(data: UserForm) {
    try {
      // Drop an empty approval limit so it isn't coerced to NaN server-side.
      const payload = { ...data, approvalLimit: data.approvalLimit ? Number(data.approvalLimit) : undefined };
      await apiFetch("/api/users", { method: "POST", body: JSON.stringify(payload) });
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
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setAssignFor(r)}>Role</Button>}
      />

      {/* Assign a custom role (or revert to the system role) */}
      <Dialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Role — {assignFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              System role: <Badge>{assignFor ? ROLE_LABEL[assignFor.role] : ""}</Badge>
              {assignFor?.roleKey && <> · currently overridden by <Badge variant="outline">{roleName(assignFor.roleKey)}</Badge></>}
            </p>
            <div className="space-y-1.5">
              <Label>Custom Role</Label>
              <Select value={assignFor?.roleKey ?? "none"} onValueChange={(v) => assignFor && assignRole(assignFor, v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Pick a custom role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Use system role ({assignFor ? ROLE_LABEL[assignFor.role] : ""}) —</SelectItem>
                  {customRoles.map((r) => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">A custom role replaces the system role's permissions. ADMIN/DRIVER special behaviors still follow the system role.</p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
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

            <FormSection title="Profile & Access">
              <div className="space-y-1.5"><Label>Phone</Label><Input {...register("phone")} /></div>
              <div className="space-y-1.5"><Label>Job Title</Label><Input placeholder="Dispatcher / Accountant…" {...register("jobTitle")} /></div>
              <div className="space-y-1.5"><Label>Assigned Branch</Label><Input {...register("assignedBranch")} /></div>
              <div className="space-y-1.5"><Label>Cost Center</Label><Input {...register("costCenter")} /></div>
              <div className="space-y-1.5"><Label>Approval Limit</Label><Input type="number" step="0.01" {...register("approvalLimit")} /></div>
              <div className="space-y-1.5"><Label>Language</Label><Input {...register("languagePref")} /></div>
              <div className="space-y-1.5"><Label>Time Zone</Label><Input placeholder="Africa/Dar_es_Salaam" {...register("timeZone")} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" {...register("esignatory")} /> E-signature signatory (can sign freight bills / LRs / PODs)
              </label>
            </FormSection>

            <DialogFooter><Button type="submit" disabled={isSubmitting}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
