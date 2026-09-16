"use client";
import { useCallback, useEffect, useState } from "react";
import { FileDown, Handshake, Factory, Truck, XCircle } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

interface View {
  poNumber: string; status: string; currency: string; subtotal: string; orderDate: string; expectedAt: string | null; committedDeliveryDate: string | null; supplierNote: string | null;
  issuedAt: string | null; acknowledgedAt: string | null; inProductionAt: string | null; dispatchedAt: string | null; buyer: string; vendor: { code: string; legalName: string };
  lines: { description: string; quantity: string; unitPrice: string; lineTotal: string }[]; expiresAt: string | null;
  canAcknowledge: boolean; canReportProduction: boolean; canReportDispatch: boolean;
}

const money = (v: string, c: string) => `${c} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<string, string> = { ISSUED: "Awaiting your acknowledgement", ACKNOWLEDGED: "Acknowledged", IN_PRODUCTION: "In production", DISPATCHED: "Dispatched", PARTIAL: "Partly received by the buyer", RECEIVED: "Received by the buyer", CLOSED: "Closed", CANCELLED: "Cancelled" };

/**
 * What a supplier sees and can do with the link: the order, its PDF,
 * accept with a committed date or reject, then report production and
 * dispatch. No login; the link is the credential, and it expires.
 */
export function SupplierOrder({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/supplier/po/${token}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "This link could not be opened");
      setView(j.data); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "This link could not be opened"); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function act(action: "acknowledge" | "production" | "dispatch", body: Record<string, unknown>, label: string) {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/supplier/po/${token}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "That could not be recorded");
      setView(j.data); setDone(label); setNote("");
    } catch (e) { setError(e instanceof Error ? e.message : "That could not be recorded"); }
    finally { setBusy(false); }
  }

  if (error && !view) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Purchase order link</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }
  if (!view) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Purchase order from {view.buyer}</div>
            <h1 className="text-xl font-semibold"><span className="font-mono">{view.poNumber}</span> <span className="text-base font-normal text-muted-foreground">to {view.vendor.legalName}</span></h1>
          </div>
          <Badge variant={view.status === "CANCELLED" ? "destructive" : view.status === "ISSUED" ? "warning" : "success"}>{STATUS[view.status] ?? view.status}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><div className="text-[11px] uppercase text-muted-foreground">Order date</div>{view.orderDate.slice(0, 10)}</div>
          <div><div className="text-[11px] uppercase text-muted-foreground">Expected</div>{(view.committedDeliveryDate ?? view.expectedAt)?.slice(0, 10) ?? "-"}</div>
          <div><div className="text-[11px] uppercase text-muted-foreground">Total</div><span className="font-semibold tabular-nums">{money(view.subtotal, view.currency)}</span></div>
          <div><div className="text-[11px] uppercase text-muted-foreground">Link valid until</div>{view.expiresAt ? view.expiresAt.slice(0, 10) : "-"}</div>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-2 text-left">Description</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit price</th><th className="p-2 text-right">Total</th></tr></thead>
          <tbody className="tabular-nums">{view.lines.map((l, i) => <tr key={i} className="border-t"><td className="p-2">{l.description}</td><td className="p-2 text-right">{Number(l.quantity)}</td><td className="p-2 text-right">{Number(l.unitPrice).toLocaleString()}</td><td className="p-2 text-right">{Number(l.lineTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>)}</tbody>
        </table>
        <div className="mt-3"><a href={`${API_BASE}/api/supplier/po/${token}/pdf`} className="inline-flex items-center gap-1 text-sm underline"><FileDown className="h-4 w-4" />Download the order (PDF)</a></div>
      </div>

      {error && <p className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">{error}</p>}
      {done && <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">{done}. Thank you; the buyer has been updated.</p>}

      {view.canAcknowledge && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold">Acknowledge this order</h2>
          <p className="text-sm text-muted-foreground">Please confirm you can supply it and the date you commit to deliver by.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Committed delivery date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Remarks (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy || !date} onClick={() => act("acknowledge", { accept: true, committedDeliveryDate: date, note: note || null }, "Order accepted")}><Handshake className="h-4 w-4" />Accept and commit</Button>
            <Button variant="outline" disabled={busy} onClick={() => act("acknowledge", { accept: false, note: note || null }, "Order declined")}><XCircle className="h-4 w-4" />Decline</Button>
          </div>
        </div>
      )}
      {(view.canReportProduction || view.canReportDispatch) && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold">Progress</h2>
          <div className="mt-3 space-y-1.5"><Label>Update (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Loading on Thursday, truck T 445 ABC" /></div>
          <div className="mt-3 flex flex-wrap gap-2">
            {view.canReportProduction && <Button variant="outline" disabled={busy} onClick={() => act("production", { note: note || null }, "Marked in production")}><Factory className="h-4 w-4" />In production</Button>}
            {view.canReportDispatch && <Button disabled={busy} onClick={() => act("dispatch", { note: note || null }, "Marked dispatched")}><Truck className="h-4 w-4" />Dispatched</Button>}
          </div>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">This page is for {view.vendor.legalName}. Do not forward the link.</p>
    </div>
  );
}
