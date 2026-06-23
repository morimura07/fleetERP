"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { clientSchema, type ClientInput } from "@/lib/validations";
import { apiFetch, ApiError } from "@/lib/fetcher";

interface Client extends ClientInput { id: string; }

const columns: Column<Client>[] = [
  { key: "companyName", header: "Company" },
  { key: "contactPerson", header: "Contact" },
  { key: "phone", header: "Phone" },
  { key: "email", header: "Email" },
];

export function ClientsManager() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const form = useForm<ClientInput>({ resolver: zodResolver(clientSchema) });

  function openCreate() { setEditing(null); form.reset({ companyName: "", contactPerson: "", phone: "", address: "", email: "" }); setOpen(true); }
  function openEdit(c: Client) { setEditing(c); form.reset(c); setOpen(true); }

  async function onSubmit(data: ClientInput) {
    try {
      if (editing) {
        await apiFetch(`/api/clients/${editing.id}`, { method: "PATCH", body: JSON.stringify(data) });
      } else {
        await apiFetch("/api/clients", { method: "POST", body: JSON.stringify(data) });
      }
      toast({ title: "Saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function onDelete(c: Client) {
    if (!confirm(`Delete ${c.companyName}?`)) return;
    try {
      await apiFetch(`/api/clients/${c.id}`, { method: "DELETE" });
      toast({ title: "Deleted", variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to delete", variant: "destructive" });
    }
  }

  return (
    <>
      <DataTable<Client>
        endpoint="/api/clients"
        columns={columns}
        searchPlaceholder="Search by company, contact, or email"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New</Button>}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Client" : "New Client"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {([
              ["companyName", "Company"], ["contactPerson", "Contact Person"],
              ["phone", "Phone"], ["email", "Email"], ["address", "Address"],
            ] as const).map(([name, label]) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={name}>{label}</Label>
                <Input id={name} {...form.register(name)} />
                {form.formState.errors[name] && (
                  <p className="text-xs text-destructive">{form.formState.errors[name]?.message as string}</p>
                )}
              </div>
            ))}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
