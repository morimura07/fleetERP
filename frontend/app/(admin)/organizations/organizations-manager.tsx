"use client";
import { useState } from "react";
import { Plus, Network, Building2, Pencil, FlaskConical } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

export interface Organization {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  version: number;
  companies: { code: string; name: string; isSandbox: boolean }[];
}

export function OrganizationsManager({ initial }: { initial: Organization[] }) {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<Organization[]>(initial);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const reload = async () => setOrgs(await apiFetch<Organization[]>("/api/organizations"));
  const fail = (e: unknown) =>
    toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });

  async function create() {
    setBusy(true);
    try {
      await apiFetch("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim(), isActive: true }),
      });
      toast({ title: "Organization created", variant: "success" });
      setCreateOpen(false); setCode(""); setName("");
      await reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function save(org: Organization) {
    setBusy(true);
    try {
      await apiFetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), version: org.version }),
      });
      toast({ title: "Organization updated", variant: "success" });
      setEditing(null);
      await reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setCode(""); setName(""); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" />New Organization
        </Button>
      </div>

      {orgs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-10 text-center">
          <Network className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No organizations yet. Create one to hold a customer&apos;s companies.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {orgs.map((o) => (
            <div key={o.id} className="rounded-xl border border-border bg-card/50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
                    {o.name}
                    {!o.isActive && <Badge variant="destructive">Inactive</Badge>}
                  </h3>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{o.code}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => { setName(o.name); setEditing(o); }}
                >
                  <Pencil className="h-3.5 w-3.5" />Edit
                </Button>
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Companies ({o.companies.length})
                </div>
                {o.companies.length === 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    None yet. An admin of this organization creates them under Companies.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {o.companies.map((co) => (
                      <li key={co.code} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                          <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{co.name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {co.isSandbox && (
                            <Badge variant="warning"><FlaskConical className="mr-1 h-2.5 w-2.5" />Demo</Badge>
                          )}
                          <span className="font-mono text-muted-foreground">{co.code}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Organization</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="Ascomark Logistics"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!code) setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Code <span className="text-muted-foreground">(2 to 10 letters or digits)</span></Label>
              <Input className="font-mono" placeholder="ASCOMARK" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </div>
            <p className="text-xs text-muted-foreground">
              The code is permanent once companies are attached, because their data is resolved through it.
              An admin of this organization then creates its companies and users, and cannot see any other organization.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={busy || !name.trim() || code.trim().length < 2}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {editing?.code}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <p className="text-xs text-muted-foreground">The code cannot be changed after creation.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={busy || !name.trim()} onClick={() => editing && save(editing)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
