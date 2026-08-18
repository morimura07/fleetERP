"use client";
import { useState } from "react";
import { Plus, RotateCcw, FlaskConical, AlertTriangle, KeyRound, Copy, Check, CalendarClock } from "lucide-react";
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
  expiresAt: string | null;
  expired: boolean;
  daysRemaining: number | null;
  demoUsers: { email: string; role: string }[];
  counts: { orders: number; trips: number; clients: number; customers: number; vehicles: number; accounts: number };
}

interface Credentials {
  password: string;
  expiresAt: string | null;
  users: { email: string; role: string; name: string }[];
}

/** Sign-in sheet for a demo: one password, one line per role. */
function credentialsText(c: Credentials): string {
  const rows = c.users.map((u) => `${u.role.padEnd(11)} ${u.email}`).join("\n");
  const until = c.expiresAt ? `\nAccess until: ${new Date(c.expiresAt).toLocaleDateString()}` : "";
  return `FleetFlow demo sign-in\n\n${rows}\n\nPassword (all accounts): ${c.password}${until}`;
}

function AccessBadge({ p }: { p: SandboxStatus }) {
  if (p.expired) return <Badge variant="destructive">Expired</Badge>;
  if (p.daysRemaining == null) return <Badge variant="secondary">No expiry</Badge>;
  return (
    <Badge variant={p.daysRemaining <= 3 ? "warning" : "secondary"}>
      {p.daysRemaining} day{p.daysRemaining === 1 ? "" : "s"} left
    </Badge>
  );
}

export function SandboxManager({ initial }: { initial: SandboxStatus[] }) {
  const { toast } = useToast();
  const [partitions, setPartitions] = useState<SandboxStatus[]>(initial);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<SandboxStatus | null>(null);
  const [expiryFor, setExpiryFor] = useState<SandboxStatus | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState("30");

  const reload = async () => setPartitions(await apiFetch<SandboxStatus[]>("/api/sandbox"));
  const fail = (e: unknown) =>
    toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });

  /** Blank/0 means "never expires". */
  const parseDays = (v: string): number | null => {
    const n = Number(v.trim());
    return v.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : Math.floor(n);
  };

  async function provision() {
    setBusy(true);
    try {
      const res = await apiFetch<{ credentials: Credentials }>("/api/sandbox/provision", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim(), expiresInDays: parseDays(days) }),
      });
      setCreateOpen(false);
      setCode(""); setName(""); setDays("30");
      setCredentials(res.credentials); // shown once — the password is not stored in plaintext
      await reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function doReset(p: SandboxStatus) {
    setBusy(true);
    try {
      await apiFetch("/api/sandbox/reset", { method: "POST", body: JSON.stringify({ code: p.code }) });
      toast({ title: `${p.code} reset to demo baseline`, description: "Demo sign-in details are unchanged.", variant: "success" });
      setResetFor(null); await reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function newPassword(p: SandboxStatus) {
    setBusy(true);
    try {
      const c = await apiFetch<Credentials>("/api/sandbox/credentials", {
        method: "POST",
        body: JSON.stringify({ code: p.code }),
      });
      setCredentials(c);
      await reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function saveExpiry(p: SandboxStatus) {
    setBusy(true);
    try {
      await apiFetch("/api/sandbox/expiry", {
        method: "PATCH",
        body: JSON.stringify({ code: p.code, expiresInDays: parseDays(days) }),
      });
      toast({ title: "Access window updated", variant: "success" });
      setExpiryFor(null); await reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentialsText(credentials));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast({ title: "Could not copy — select the text instead", variant: "destructive" }); }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setCode(""); setName(""); setDays("30"); setCreateOpen(true); }}><Plus className="h-4 w-4" />New Sandbox</Button>
      </div>

      {partitions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-10 text-center">
          <FlaskConical className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No sandbox partition yet. Create one to get an isolated demo area with a clean chart of accounts, sample records and its own sign-in details.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {partitions.map((p) => (
            <div key={p.code} className="rounded-xl border border-border bg-card/50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
                    {p.name}
                    <Badge variant="warning"><FlaskConical className="mr-1 h-3 w-3" />Sandbox</Badge>
                    <AccessBadge p={p} />
                  </h3>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{p.code}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => { setDays(p.daysRemaining?.toString() ?? ""); setExpiryFor(p); }}><CalendarClock className="h-3.5 w-3.5" />Access</Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setResetFor(p)}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                {Object.entries(p.counts).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border bg-background/40 px-2 py-1.5">
                    <div className="text-lg font-bold tabular-nums text-foreground">{v}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Demo sign-in</span>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => newPassword(p)}><KeyRound className="h-3.5 w-3.5" />New password</Button>
                </div>
                {p.demoUsers.length === 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">No demo logins yet — use <b>New password</b> to create them.</p>
                ) : (
                  <ul className="mt-1.5 space-y-0.5">
                    {p.demoUsers.map((u) => (
                      <li key={u.email} className="flex justify-between gap-2 font-mono text-xs text-muted-foreground">
                        <span className="truncate">{u.email}</span>
                        <span className="shrink-0 opacity-70">{u.role}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">The password is shown only when issued. Lost it? Use <b>New password</b>.</p>
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
            <div className="space-y-1.5">
              <Label>Access window <span className="text-muted-foreground">(days — leave blank for no expiry)</span></Label>
              <Input type="number" min={1} max={365} placeholder="30" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Creates an isolated company with a demo chart of accounts, sample records and one sign-in per role. Existing real companies can never be turned into a sandbox.</p>
          </div>
          <DialogFooter><Button onClick={provision} disabled={busy || !name.trim() || !code.trim()}>Provision</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials — the only time the password is visible */}
      <Dialog open={!!credentials} onOpenChange={(o) => !o && setCredentials(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-emerald-500" />Demo sign-in details</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copy these now — the password is stored only as a hash and <b>cannot be shown again</b>. Issuing a new one replaces it.
          </p>
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="space-y-1">
              {credentials?.users.map((u) => (
                <div key={u.email} className="flex justify-between gap-3 font-mono text-xs">
                  <span className="truncate text-foreground">{u.email}</span>
                  <span className="shrink-0 text-muted-foreground">{u.role}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Password (all accounts)</div>
              <div className="mt-0.5 select-all font-mono text-base font-semibold text-foreground">{credentials?.password}</div>
            </div>
            {credentials?.expiresAt && (
              <p className="mt-2 text-xs text-muted-foreground">Access until {new Date(credentials.expiresAt).toLocaleDateString()}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyCredentials}>
              {copied ? <><Check className="h-4 w-4" />Copied</> : <><Copy className="h-4 w-4" />Copy all</>}
            </Button>
            <Button onClick={() => setCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Access window */}
      <Dialog open={!!expiryFor} onOpenChange={(o) => !o && setExpiryFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Access window — {expiryFor?.code}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Expires in <span className="text-muted-foreground">(days from now — blank for no expiry)</span></Label>
            <Input type="number" min={1} max={365} placeholder="No expiry" value={days} onChange={(e) => setDays(e.target.value)} />
            <p className="text-xs text-muted-foreground">Once the window closes, every sign-in to this partition is refused. Real companies are unaffected.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpiryFor(null)}>Cancel</Button>
            <Button disabled={busy} onClick={() => expiryFor && saveExpiry(expiryFor)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation */}
      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Reset {resetFor?.code}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This wipes <b>all data</b> in the <b>{resetFor?.name}</b> sandbox partition and restores a clean demo baseline.
            Demo sign-in details keep working. It only affects this sandbox — real companies are never touched.
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
