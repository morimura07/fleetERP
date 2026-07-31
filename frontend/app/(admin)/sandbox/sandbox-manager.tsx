"use client";
import { useState } from "react";
import { Plus, RotateCcw, FlaskConical, AlertTriangle } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

export interface SandboxStatus {
  code: string;
  name: string;
  isSandbox: true;
  counts: { orders: number; trips: number; clients: number; customers: number; vehicles: number; accounts: number };
}

export function SandboxManager({ initial }: { initial: SandboxStatus[] }) {
  const { toast } = useToast();
  const [partitions, setPartitions] = useState<SandboxStatus[]>(initial);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<SandboxStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const reload = async () => setPartitions(await apiFetch<SandboxStatus[]>("/api/sandbox"));

  async function provision() {
    setBusy(true);
    try {
      await apiFetch("/api/sandbox/provision", { method: "POST", body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim() }) });
      toast({ title: "Sandbox provisioned", variant: "success" });
      setCreateOpen(false); setCode(""); setName(""); await reload();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function doReset(p: SandboxStatus) {
    setBusy(true);
    try {
      await apiFetch("/api/sandbox/reset", { method: "POST", body: JSON.stringify({ code: p.code }) });
      toast({ title: `${p.code} reset to demo baseline`, variant: "success" });
      setResetFor(null); await reload();
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setCode(""); setName(""); setCreateOpen(true); }}><Plus className="h-4 w-4" />New Sandbox</Button>
      </div>

      {partitions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-10 text-center">
          <FlaskConical className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No sandbox partition yet. Create one to get an isolated demo area with a clean chart of accounts and sample records.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {partitions.map((p) => (
            <div key={p.code} className="rounded-xl border border-border bg-card/50 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    {p.name} <Badge variant="warning"><FlaskConical className="mr-1 h-3 w-3" />Sandbox</Badge>
                  </h3>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{p.code}</p>
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setResetFor(p)}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                {Object.entries(p.counts).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border bg-background/40 px-2 py-1.5">
                    <div className="text-lg font-bold tabular-nums text-foreground">{v}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Provision */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Sandbox Partition</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="Training Sandbox" value={name} onChange={(e) => { setName(e.target.value); if (!code) setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10)); }} />
            </div>
            <div className="space-y-1.5">
              <Label>Company Code <span className="text-muted-foreground">(2–10 letters/digits, becomes the data area)</span></Label>
              <Input className="font-mono" placeholder="SANDBOX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </div>
            <p className="text-xs text-muted-foreground">Creates an isolated company with a demo chart of accounts and a few sample records. Existing real companies can never be turned into a sandbox.</p>
          </div>
          <DialogFooter><Button onClick={provision} disabled={busy || !name.trim() || !code.trim()}>Provision</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation */}
      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Reset {resetFor?.code}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This wipes <b>all data</b> in the <b>{resetFor?.name}</b> sandbox partition and restores a clean demo baseline.
            It only affects this sandbox — real companies are never touched.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetFor(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => resetFor && doReset(resetFor)}>Reset sandbox</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
