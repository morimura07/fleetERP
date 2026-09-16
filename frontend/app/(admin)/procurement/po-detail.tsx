"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, PackageCheck, Scale, Send, FileDown, Truck, Factory, Handshake, Ban, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { useToast } from "@frontend/components/ui/toast";
import { AttachmentsPanel } from "@frontend/components/data/attachments-panel";
import { PO_STATUS_LABEL, PO_STATUS_VARIANT, MATCH_STATUS_LABEL, MATCH_STATUS_VARIANT } from "@frontend/lib/labels";
import { apiFetch, describeError, handleUnauthorized, getActiveCompany } from "@frontend/lib/fetcher";
import { getToken } from "@frontend/lib/auth-token";
import type { PurchaseOrderStatus, MatchStatus, GrnStatus } from "@frontend/lib/enums";
import { GRN_STATUS_LABEL } from "@frontend/lib/labels";
import { ReceiptDetail } from "./receipt-detail";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const money = (v: string | number, c: string) => `${c} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "");

interface Line { id: string; stockItemId: string | null; description: string; quantity: string; qtyReceived: string; unitPrice: string; lineTotal: string; expenseCode: string }
interface Decision { id: string; step: number; roleKey: string; status: string; userName: string | null; note: string | null; decidedAt: string | null }
interface Approval { id: string; tierName: string; status: string; reason: string | null; amountBase: string; baseCurrency: string; createdAt: string; decisions: Decision[]; tier: { mode: string; minSignatures: number } | null }
export interface PoData {
  id: string; poNumber: string; status: PurchaseOrderStatus; matchStatus: MatchStatus; currency: string; subtotal: string; orderDate: string; expectedAt: string | null;
  memo: string | null; costCenter: string | null; version: number; changeOrders: number;
  issuedAt: string | null; acknowledgedAt: string | null; committedDeliveryDate: string | null; supplierNote: string | null; inProductionAt: string | null; dispatchedAt: string | null;
  requisitionId: string | null; rfqId: string | null;
  vendor: { legalName: string; code: string };
  lines: Line[];
  receipts: { id: string; receiptNumber: string; receivedAt: string; status: GrnStatus; gateEntryNo: string | null }[];
  vendorInvoice: { invoiceNumber: string; subtotal: string } | null;
  approvals: Approval[];
  savings: { initial: string | null; final: string; saved: string | null; savedPct: string | null };
}

/**
 * One purchase order through its life: the matrix on it, transmission,
 * the supplier's acknowledgement, production, dispatch, receipt and match,
 * with change orders while nothing has been received.
 */
export function PoDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);
  const [po, setPo] = useState<PoData | null>(null);
  const [busy, setBusy] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [changing, setChanging] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [gate, setGate] = useState<{ allowed: boolean; reason: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<PoData>(`/api/procurement/${id}`);
      setPo(data);
      if (["APPROVED", "ISSUED", "ACKNOWLEDGED", "IN_PRODUCTION", "DISPATCHED", "PARTIAL"].includes(data.status)) setGate(await apiFetch(`/api/procurement/${id}/grn-gate`));
      else setGate(null);
    } catch (e) { fail(e); }
  }, [id, fail]);
  useEffect(() => { load(); }, [load]);

  async function act(path: string, label: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await apiFetch<{ status?: string }>(`/api/procurement/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      if (path === "match") toast({ title: res.status === "MATCHED" ? "Matched" : "Variance found", variant: res.status === "MATCHED" ? "success" : "destructive" });
      else toast({ title: label, description: res.status ? `Now ${PO_STATUS_LABEL[res.status as PurchaseOrderStatus]?.toLowerCase() ?? res.status}` : undefined, variant: "success" });
      setNote(""); onChange(); await load();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  async function downloadPdf() {
    if (!po) return;
    try {
      const res = await fetch(`${API_BASE}/api/procurement/${id}/pdf`, { headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...(getActiveCompany() ? { "X-Data-Area": getActiveCompany() as string } : {}) } });
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) throw new Error(`The PDF could not be built (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = `${po.poNumber}.pdf`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) { fail(e); }
  }

  if (!po) return null;
  const pending = po.approvals.find((a) => a.status === "PENDING");
  const canChange = ["DRAFT", "APPROVED", "ISSUED", "ACKNOWLEDGED", "IN_PRODUCTION"].includes(po.status) && po.receipts.length === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{po.poNumber}</span>
            <Badge variant={PO_STATUS_VARIANT[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
            <Badge variant={MATCH_STATUS_VARIANT[po.matchStatus]}>{MATCH_STATUS_LABEL[po.matchStatus]}</Badge>
            <span className="ml-auto text-base font-semibold tabular-nums">{money(po.subtotal, po.currency)}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Fact label="Vendor" value={`${po.vendor.legalName} (${po.vendor.code})`} />
            <Fact label="Ordered" value={po.orderDate.slice(0, 10)} hint={po.costCenter ? `cost centre ${po.costCenter}` : undefined} />
            <Fact label="Expected" value={po.committedDeliveryDate?.slice(0, 10) ?? po.expectedAt?.slice(0, 10) ?? "-"} hint={po.committedDeliveryDate ? "committed by supplier" : undefined} />
            <Fact label="Savings" value={po.savings.saved ? `${money(po.savings.saved, po.currency)} (${po.savings.savedPct}%)` : "-"} hint={po.savings.initial ? `first quote ${money(po.savings.initial, po.currency)}` : undefined} />
            <Fact label="Issued" value={when(po.issuedAt) || "-"} />
            <Fact label="Acknowledged" value={when(po.acknowledgedAt) || "-"} hint={po.supplierNote ?? undefined} />
            <Fact label="In production" value={when(po.inProductionAt) || "-"} />
            <Fact label="Dispatched" value={when(po.dispatchedAt) || "-"} />
          </div>
          {po.memo && <p className="whitespace-pre-line text-xs text-muted-foreground">{po.memo}</p>}

          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-elevated/50 text-[11px] uppercase text-muted-foreground">
                <tr><th className="p-2 text-left">Description</th><th className="p-2 text-left">Account</th><th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Unit</th><th className="p-2 text-right">Total</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {po.lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2">{l.description}</td>
                    <td className="p-2 font-mono text-xs">{l.expenseCode}</td>
                    <td className="p-2 text-right">{Number(l.quantity)}</td>
                    <td className="p-2 text-right">{Number(l.qtyReceived)}</td>
                    <td className="p-2 text-right">{Number(l.unitPrice).toLocaleString()}</td>
                    <td className="p-2 text-right">{Number(l.lineTotal).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {po.approvals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Approval trail{po.changeOrders > 0 ? ` · ${po.changeOrders} change order(s)` : ""}</h4>
              {po.approvals.map((a) => (
                <div key={a.id} className={`rounded-md border p-2 text-xs ${a.status === "SUPERSEDED" ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.tierName}</span>
                    <Badge variant={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "destructive" : a.status === "PENDING" ? "info" : "secondary"}>{a.status.toLowerCase()}</Badge>
                    <span className="text-muted-foreground">{money(a.amountBase, a.baseCurrency)} · {a.reason} · {when(a.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {a.decisions.map((d) => <span key={d.id}><Badge variant={d.status === "APPROVED" ? "success" : d.status === "REJECTED" ? "destructive" : d.status === "PENDING" ? "info" : "secondary"}>{d.status.toLowerCase()}</Badge> <span className="font-mono">{d.roleKey}</span>{d.userName ? ` · ${d.userName}` : ""}{d.note ? ` · ${d.note}` : ""}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {po.receipts.length > 0 && (
            <div className="rounded-md border">
              <div className="border-b px-3 py-1.5 text-xs font-medium uppercase text-muted-foreground">Goods receipts</div>
              {po.receipts.map((r) => (
                <button key={r.id} type="button" onClick={() => setReceiptId(r.id)} className="flex w-full items-center gap-3 border-t px-3 py-1.5 text-left text-sm hover:bg-elevated">
                  <span className="font-mono">{r.receiptNumber}</span>
                  <span className="text-muted-foreground">{r.receivedAt.slice(0, 10)}{r.gateEntryNo ? ` · gate ${r.gateEntryNo}` : ""}</span>
                  <Badge variant={r.status === "COMPLETED" ? "success" : r.status === "INSPECTING" ? "warning" : "secondary"}>{GRN_STATUS_LABEL[r.status]}</Badge>
                </button>
              ))}
            </div>
          )}
          {gate && !gate.allowed && <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-sm text-amber-500">{gate.reason}</p>}
          {po.vendorInvoice && <p className="text-xs text-muted-foreground">Matched against invoice {po.vendorInvoice.invoiceNumber} for {money(po.vendorInvoice.subtotal, po.currency)}</p>}

          <AttachmentsPanel entityType="PurchaseOrder" entityId={po.id} />

          {(po.status === "RECEIVED" || po.status === "PARTIAL") && (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5"><Label>Vendor invoice ID (three-way match)</Label><Input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} /></div>
              <Button variant="outline" disabled={busy || !invoiceId} onClick={() => act("match", "Matched", { vendorInvoiceId: invoiceId })}><Scale className="h-4 w-4" />Match</Button>
            </div>
          )}
          {["PENDING_APPROVAL", "ISSUED"].includes(po.status) && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={po.status === "ISSUED" ? "Supplier's remarks" : "Optional"} /></div>
              {po.status === "ISSUED" && <div className="space-y-1.5"><Label>Committed delivery date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {canChange && <Button variant="outline" disabled={busy} onClick={() => setChanging(true)}><Pencil className="h-4 w-4" />Change order</Button>}
            {po.status === "DRAFT" && <Button disabled={busy} onClick={() => act("submit", "Submitted for approval")}><Send className="h-4 w-4" />Submit for approval</Button>}
            {po.status === "PENDING_APPROVAL" && pending && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => act("decide", "Rejected", { approve: false, note })}><XCircle className="h-4 w-4" />Reject</Button>
                <Button disabled={busy} onClick={() => act("decide", "Approved", { approve: true, note })}><CheckCircle2 className="h-4 w-4" />Approve</Button>
              </>
            )}
            {po.status === "APPROVED" && <Button disabled={busy} onClick={() => act("issue", "Issued to the supplier")}><Send className="h-4 w-4" />Issue</Button>}
            {!["DRAFT", "PENDING_APPROVAL"].includes(po.status) && <Button variant="outline" onClick={downloadPdf}><FileDown className="h-4 w-4" />PDF</Button>}
            {po.status === "ISSUED" && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => act("acknowledge", "Supplier rejected", { accept: false, note })}><XCircle className="h-4 w-4" />Supplier rejects</Button>
                <Button disabled={busy || !date} onClick={() => act("acknowledge", "Acknowledged", { accept: true, committedDeliveryDate: date, note })}><Handshake className="h-4 w-4" />Supplier accepts</Button>
              </>
            )}
            {po.status === "ACKNOWLEDGED" && <Button variant="outline" disabled={busy} onClick={() => act("production", "In production")}><Factory className="h-4 w-4" />In production</Button>}
            {["ACKNOWLEDGED", "IN_PRODUCTION"].includes(po.status) && <Button variant="outline" disabled={busy} onClick={() => act("dispatch", "Dispatched")}><Truck className="h-4 w-4" />Dispatched</Button>}
            {["APPROVED", "ISSUED", "ACKNOWLEDGED", "IN_PRODUCTION", "DISPATCHED", "PARTIAL"].includes(po.status) && <Button disabled={busy || (gate ? !gate.allowed : false)} title={gate?.reason ?? undefined} onClick={() => setReceiving(true)}><PackageCheck className="h-4 w-4" />Receive goods</Button>}
            {!["PARTIAL", "RECEIVED", "CLOSED", "CANCELLED"].includes(po.status) && <Button variant="ghost" disabled={busy} onClick={() => act("cancel", "Cancelled", { reason: note })}><Ban className="h-4 w-4" />Cancel</Button>}
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </div>
        {changing && <ChangeOrderDialog po={po} onClose={() => setChanging(false)} onSaved={async () => { onChange(); await load(); }} />}
        {receiving && <ReceiveDialog po={po} onClose={() => setReceiving(false)} onSaved={async (rid) => { onChange(); await load(); setReceiptId(rid); }} />}
        {receiptId && <ReceiptDetail id={receiptId} onClose={() => setReceiptId(null)} onChange={async () => { onChange(); await load(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function ChangeOrderDialog({ po, onClose, onSaved }: { po: PoData; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState(po.lines.map((l) => ({ stockItemId: l.stockItemId, description: l.description, quantity: String(Number(l.quantity)), unitPrice: String(Number(l.unitPrice)), expenseCode: l.expenseCode })));
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);

  async function submit() {
    setBusy(true);
    try {
      const res = await apiFetch<{ retriggered: string | null; status: PurchaseOrderStatus }>(`/api/procurement/${po.id}/lines`, {
        method: "PUT", body: JSON.stringify({ version: po.version, reason, lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })) }),
      });
      toast({ title: "Change order recorded", description: res.retriggered ? `Approval re-opened: ${res.retriggered}` : "Within the policy's variance; no new approval needed", variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Change order on {po.poNumber}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the order is changing" /></div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-1 text-left">Description</th><th className="p-1 text-right">Qty</th><th className="p-1 text-right">Unit price</th><th className="p-1 text-left">Account</th><th className="p-1 text-right">Total</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="p-1"><Input className="h-9" value={l.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
                  <td className="p-1 w-24"><Input className="h-9 text-right" type="number" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} /></td>
                  <td className="p-1 w-32"><Input className="h-9 text-right" type="number" step="0.01" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} /></td>
                  <td className="p-1 w-24"><Input className="h-9" value={l.expenseCode} onChange={(e) => set(i, { expenseCode: e.target.value })} /></td>
                  <td className="p-1 text-right tabular-nums">{(Number(l.quantity || 0) * Number(l.unitPrice || 0)).toFixed(2)}</td>
                  <td className="p-1"><Button variant="ghost" size="sm" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { stockItemId: null, description: "", quantity: "1", unitPrice: "0", expenseCode: "5100" }])}><Plus className="h-3.5 w-3.5" />Add line</Button>
            <span className="text-sm font-semibold tabular-nums">{money(total, po.currency)} <span className="font-normal text-muted-foreground">(was {money(po.subtotal, po.currency)})</span></span>
          </div>
          <p className="text-xs text-muted-foreground">A change beyond the policy&#39;s variance, or into another approval tier, re-opens the approval matrix automatically.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || reason.length < 3 || lines.some((l) => !l.description)}>Record change</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** The dock count: gate entry, delivery note, quantities per line (outstanding by default). */
function ReceiveDialog({ po, onClose, onSaved }: { po: PoData; onClose: () => void; onSaved: (receiptId: string) => void }) {
  const { toast } = useToast();
  const [gateEntryNo, setGateEntryNo] = useState("");
  const [deliveryNoteNo, setDeliveryNoteNo] = useState("");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(po.lines.map((l) => [l.id, String(Math.max(0, Number(l.quantity) - Number(l.qtyReceived)))])));
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const lines = po.lines.map((l) => ({ purchaseOrderLineId: l.id, quantity: Number(qty[l.id] || 0) })).filter((l) => l.quantity > 0);
      const r = await apiFetch<{ id: string; receiptNumber: string }>(`/api/procurement/${po.id}/receive`, { method: "POST", body: JSON.stringify({ gateEntryNo: gateEntryNo || "", deliveryNoteNo: deliveryNoteNo || "", note, lines }) });
      toast({ title: `${r.receiptNumber} recorded`, description: "Inspect each line to accept it into stock", variant: "success" });
      onSaved(r.id); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Receive goods against {po.poNumber}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>Gate entry no.</Label><Input value={gateEntryNo} onChange={(e) => setGateEntryNo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Delivery note no.</Label><Input value={deliveryNoteNo} onChange={(e) => setDeliveryNoteNo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-1 text-left">Line</th><th className="p-1 text-right">Ordered</th><th className="p-1 text-right">Already received</th><th className="p-1 text-right">Counted now</th></tr></thead>
          <tbody className="tabular-nums">
            {po.lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-1">{l.description}</td>
                <td className="p-1 text-right">{Number(l.quantity)}</td>
                <td className="p-1 text-right">{Number(l.qtyReceived)}</td>
                <td className="p-1 w-32"><Input className="h-9 text-right" type="number" min="0" step="0.001" value={qty[l.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">Over-delivery beyond the policy&#39;s tolerance is refused. Stock is updated when each line passes inspection.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || po.lines.every((l) => !Number(qty[l.id]))}>Record receipt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
