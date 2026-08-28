"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Shield, Trash2, Save, Lock } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

interface Role {
  key: string; name: string; description: string | null; isSystem: boolean;
  permissions: string[]; userCount: number;
}

/** Group "order:read" → { order: ["order:read", ...] } for the matrix. */
function groupByResource(perms: string[]): Record<string, string[]> {
  const g: Record<string, string[]> = {};
  for (const p of [...perms].sort()) {
    const res = p.split(":")[0];
    (g[res] ??= []).push(p);
  }
  return g;
}

export function RolesManager() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPerms, setAllPerms] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rs, ps] = await Promise.all([
        apiFetch<Role[]>("/api/rbac/roles"),
        apiFetch<string[]>("/api/rbac/permissions"),
      ]);
      setRoles(rs);
      setAllPerms(ps);
      setSelectedKey((cur) => cur ?? rs[0]?.key ?? null);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to load", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const selected = roles.find((r) => r.key === selectedKey) ?? null;
  // Reset the draft whenever the selected role changes.
  useEffect(() => { setDraft(new Set(selected?.permissions ?? [])); }, [selectedKey, roles]);

  const grouped = useMemo(() => groupByResource(allPerms), [allPerms]);
  const dirty = selected && (
    draft.size !== selected.permissions.length ||
    selected.permissions.some((p) => !draft.has(p))
  );

  function toggle(p: string) {
    setDraft((d) => { const n = new Set(d); n.has(p) ? n.delete(p) : n.add(p); return n; });
  }
  function toggleGroup(res: string, on: boolean) {
    setDraft((d) => {
      const n = new Set(d);
      for (const p of grouped[res]) on ? n.add(p) : n.delete(p);
      return n;
    });
  }

  async function savePermissions() {
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/api/rbac/roles/${selected.key}/permissions`, {
        method: "PUT", body: JSON.stringify({ permissions: [...draft] }),
      });
      toast({ title: `Permissions updated for ${selected.name}`, variant: "success" });
      await load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function removeRole(role: Role) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/rbac/roles/${role.key}`, { method: "DELETE" });
      toast({ title: "Role deleted", variant: "success" });
      if (selectedKey === role.key) setSelectedKey(null);
      await load();
    } catch (e) {
      toast({ title: "Cannot delete", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    }
  }

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Role list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Roles</h2>
            <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New</Button>
          </div>
          <div className="flex flex-col gap-1">
            {roles.map((r) => (
              <button
                key={r.key}
                onClick={() => setSelectedKey(r.key)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedKey === r.key ? "border-primary/50 bg-primary/10" : "border-border hover:bg-elevated"
                }`}
              >
                <span className="flex items-center gap-2">
                  {r.isSystem ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Shield className="h-3.5 w-3.5 text-primary" />}
                  <span className="font-medium">{r.name}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] tabular-nums text-muted-foreground">{r.permissions.length}p</span>
                  {r.userCount > 0 && <Badge variant="secondary" className="text-[10px]">{r.userCount}u</Badge>}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Permission matrix */}
        {selected ? (
          <div className="rounded-xl border border-border bg-card/50 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  {selected.name}
                  {selected.isSystem
                    ? <Badge variant="secondary">Built-in</Badge>
                    : <Badge variant="outline" className="font-mono">{selected.key}</Badge>}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selected.description || (selected.isSystem ? "Built-in system role — permissions are editable." : "Custom role.")}
                  {" · "}{draft.size} of {allPerms.length} permissions
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!selected.isSystem && (
                  <Button variant="ghost" size="sm" onClick={() => removeRole(selected)}><Trash2 className="h-4 w-4" />Delete</Button>
                )}
                <Button size="sm" onClick={savePermissions} disabled={saving || !dirty}>
                  <Save className="h-4 w-4" />{dirty ? "Save changes" : "Saved"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(grouped).map(([res, perms]) => {
                const allOn = perms.every((p) => draft.has(p));
                const someOn = perms.some((p) => draft.has(p));
                return (
                  <div key={res} className="rounded-lg border border-border p-3">
                    <label className="mb-2 flex items-center gap-2 border-b border-border pb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }}
                        onChange={(e) => toggleGroup(res, e.target.checked)}
                      />
                      {res}
                    </label>
                    <div className="flex flex-col gap-1.5">
                      {perms.map((p) => (
                        <label key={p} className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={draft.has(p)} onChange={() => toggle(p)} />
                          <span className="text-muted-foreground">{p.split(":")[1]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">Select a role to edit its permissions.</div>
        )}
      </div>

      {/* Approval authority — who may approve, and up to what value.
          Placed here at the client's request: it is an authority question, and
          the user form can only set it at creation, never change it after. */}
      <ApprovalAuthorityPanel />


      <CreateRoleDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(k) => { setSelectedKey(k); load(); }} />
    </>
  );
}

function CreateRoleDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (key: string) => void }) {
  const { toast } = useToast();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setKey(""); setName(""); setDescription(""); } }, [open]);

  async function submit() {
    setBusy(true);
    try {
      const role = await apiFetch<{ key: string }>("/api/rbac/roles", {
        method: "POST",
        body: JSON.stringify({ key: key.trim().toUpperCase(), name: name.trim(), description: description || null, permissions: [] }),
      });
      toast({ title: "Role created", variant: "success" });
      onClose();
      onCreated(role.key);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Role</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Role Name</Label>
            <Input placeholder="Yard Supervisor" value={name} onChange={(e) => { setName(e.target.value); if (!key) setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Key <span className="text-muted-foreground">(UPPER_SNAKE_CASE, immutable)</span></Label>
            <Input className="font-mono" placeholder="YARD_SUPERVISOR" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">Created with no permissions — grant them from the matrix after creating.</p>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy || !name.trim() || !key.trim()}>Create Role</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AuthorityUser {
  id: string; name: string; email: string; role: string;
  approvalLimit: string | null; esignatory: boolean;
}

function ApprovalAuthorityPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AuthorityUser[]>([]);
  const [editing, setEditing] = useState<AuthorityUser | null>(null);
  const [limit, setLimit] = useState("");
  const [signatory, setSignatory] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setUsers(await apiFetch<AuthorityUser[]>("/api/users?pageSize=100"));
    } catch { /* the panel is secondary; the role matrix still works */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  function open(u: AuthorityUser) {
    setEditing(u);
    setLimit(u.approvalLimit ?? "");
    setSignatory(u.esignatory);
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      // Blank removes the authority; 0 means "may approve, but nothing above zero".
      const approvalLimit = limit.trim() === "" ? null : Number(limit);
      await apiFetch(`/api/rbac/users/${editing.id}/approval`, {
        method: "PATCH",
        body: JSON.stringify({ approvalLimit, esignatory: signatory }),
      });
      toast({ title: approvalLimit == null ? "Approval authority removed" : "Approval authority updated", variant: "success" });
      setEditing(null);
      await load();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card/50 p-5">
      <h2 className="text-sm font-semibold text-foreground">
        Approval Authority <span className="font-normal text-muted-foreground">— who may approve, and up to what value</span>
      </h2>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-1.5 font-medium">User</th>
              <th className="pb-1.5 font-medium">Role</th>
              <th className="pb-1.5 text-right font-medium">Approval limit</th>
              <th className="pb-1.5 text-center font-medium">E-signatory</th>
              <th className="pb-1.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/50 last:border-0">
                <td className="py-2">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="py-2 text-xs text-muted-foreground">{u.role}</td>
                <td className="py-2 text-right tabular-nums">
                  {u.approvalLimit == null
                    ? <span className="text-muted-foreground">No authority</span>
                    : `USD ${parseFloat(u.approvalLimit).toLocaleString()}`}
                </td>
                <td className="py-2 text-center">
                  {u.esignatory ? <Badge variant="success">Yes</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => open(u)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approval authority — {editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Approval limit (USD)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Leave blank to remove authority"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The most this user may approve on a single freight or procurement item.
                Leave blank to remove their authority entirely.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={signatory} onChange={(e) => setSignatory(e.target.checked)} />
              E-signature signatory (can sign freight bills, LRs and PODs)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={busy} onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
