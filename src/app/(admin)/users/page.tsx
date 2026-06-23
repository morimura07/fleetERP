"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/fetcher";
import { ROLE_LABEL } from "@/lib/labels";
import type { Role } from "@prisma/client";

interface User { id: string; name: string; email: string; role: Role; isActive: boolean; }

export default function UsersPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { register, handleSubmit, setValue, reset, getValues, formState: { isSubmitting } } =
    useForm<{ name: string; email: string; password: string; role: Role }>({ defaultValues: { role: "STAFF" } });

  const columns: Column<User>[] = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role", render: (r) => <Badge>{ROLE_LABEL[r.role]}</Badge> },
    { key: "isActive", header: "Status", render: (r) => r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
  ];

  async function onSubmit(data: { name: string; email: string; password: string; role: Role }) {
    try {
      await apiFetch("/api/users", { method: "POST", body: JSON.stringify(data) });
      toast({ title: "User created", variant: "success" });
      setOpen(false); reset({ name: "", email: "", password: "", role: "STAFF" }); setRefreshKey((k) => k + 1);
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
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select defaultValue={getValues("role")} onValueChange={(v) => setValue("role", v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ROLE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter><Button type="submit" disabled={isSubmitting}>Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
