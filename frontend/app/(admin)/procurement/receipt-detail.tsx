"use client";
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Undo2 } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { GRN_STATUS_LABEL, QA_STATUS_LABEL, QA_STATUS_VARIANT, RTV_STATUS_LABEL, RTV_STATUS_VARIANT } from "@frontend/lib/labels";
import type { GrnStatus, QaStatus, RtvStatus } from "@frontend/lib/enums";

export interface ReceiptLine {
  id: string; quantity: string; qaStatus: QaStatus; qtyAccepted: string; qtyRejected: string; qaNote: string | null; qaParams: Record<string, string> | null; inspectedAt: string | null; stockMovementId: string | null;
  purchaseOrderLine: { description: string; quantity: string; unitPrice: string; stockItemId: string | null };
  returns: { id: string; rtvNumber: string; quantity: string; status: RtvStatus }[];
}
export interface ReceiptData {
  id: string; receiptNumber: string; status: GrnStatus; receivedAt: string; gateEntryNo: string | null; deliveryNoteNo: string | null; note: string | null;
  purchaseOrder: { poNumber: string; vendor: { legalName: string } }; shipment: { shipmentNumber: string } | null; lines: ReceiptLine[];
}

/** One goods receipt: the dock count per line, each line's inspection, and returns raised from failures. */
export function ReceiptDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);
  const [r, setR] = useState<ReceiptData | null>(null);
  const [inspecting, setInspecting] = useState<ReceiptLine | null>(null);
  const [returning, setReturning] = useState<ReceiptLine | null>(null);

  const load = useCallback(async () => {
    try { setR(await apiFetch<ReceiptData>(`/api/procurement/receipts/${id}`)); } catch (e) { fail(e); }
  }, [id, fail]);
  useEffect(() => { load(); }, [load]);
  if (!r) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{r.receiptNumber}</span>
            <Badge variant={r.status === "COMPLETED" ? "success" : r.status === "INSPECTING" ? "warning" : "secondary"}>{GRN_STATUS_LABEL[r.status]}</Badge>
            <span className="text-sm text-muted-foreground">{r.purchaseOrder.poNumber} · {r.purchaseOrder.vendor.legalName} · {r.receivedAt.slice(0, 10)}</span>
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{[r.gateEntryNo && `Gate entry ${r.gateEntryNo}`, r.deliveryNoteNo && `Delivery note ${r.deliveryNoteNo}`, r.shipment && `Shipment ${r.shipment.shipmentNumber}`, r.note].filter(Boolean).join(" · ")}</p>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-2 text-left">Line</th><th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Received</th><th className="p-2 text-left">Inspection</th><th className="p-2 text-right">Accepted / rejected</th><th /></tr></thead>
          <tbody className="tabular-nums">
            {r.lines.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="p-2">{l.purchaseOrderLine.description}{l.purchaseOrderLine.stockItemId && <span className="ml-1 text-xs text-muted-foreground">stock</span>}</td>
                <td className="p-2 text-right">{Number(l.purchaseOrderLine.quantity)}</td>
                <td className="p-2 text-right">{Number(l.quantity)}</td>
                <td className="p-2">
                  <Badge variant={QA_STATUS_VARIANT[l.qaStatus]}>{QA_STATUS_LABEL[l.qaStatus]}</Badge>
                  {l.qaNote && <div className="text-xs text-muted-foreground">{l.qaNote}</div>}
                  {l.qaParams && <div className="text-xs text-muted-foreground">{Object.entries(l.qaParams).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>}
                  {l.stockMovementId && <div className="text-xs text-emerald-400">stock posted</div>}
                  {l.returns.map((rt) => <div key={rt.id} className="text-xs"><span className="font-mono">{rt.rtvNumber}</span> {Number(rt.quantity)} <Badge variant={RTV_STATUS_VARIANT[rt.status]}>{RTV_STATUS_LABEL[rt.status]}</Badge></div>)}
                </td>
                <td className="p-2 text-right">{l.qaStatus === "PENDING" ? "" : `${Number(l.qtyAccepted)} / ${Number(l.qtyRejected)}`}</td>
                <td className="p-2 text-right">
                  <div className="flex justify-end gap-1">
                    {(l.qaStatus === "PENDING" || l.qaStatus === "QUARANTINE") && <Button size="sm" variant="outline" onClick={() => setInspecting(l)}><ClipboardCheck className="h-3.5 w-3.5" />Inspect</Button>}
                    {l.qaStatus === "FAILED" && Number(l.qtyRejected) > l.returns.filter((x) => x.status !== "CLOSED").reduce((s, x) => s + Number(x.quantity), 0) && <Button size="sm" variant="outline" onClick={() => setReturning(l)}><Undo2 className="h-3.5 w-3.5" />Return</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
        {inspecting && <InspectDialog line={inspecting} onClose={() => setInspecting(null)} onSaved={async () => { onChange(); await load(); }} />}
        {returning && <ReturnDialog line={returning} onClose={() => setReturning(null)} onSaved={async () => { onChange(); await load(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function InspectDialog({ line, onClose, onSaved }: { line: ReceiptLine; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [qaStatus, setQaStatus] = useState<Exclude<QaStatus, "PENDING">>("PASSED");
  const [qtyAccepted, setQtyAccepted] = useState(String(Number(line.quantity)));
  const [note, setNote] = useState("");
  const [params, setParams] = useState<{ k: string; v: string }[]>([{ k: "", v: "" }]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const p = Object.fromEntries(params.filter((x) => x.k.trim()).map((x) => [x.k.trim(), x.v]));
      await apiFetch(`/api/procurement/receipt-lines/${line.id}/inspect`, { method: "POST", body: JSON.stringify({ qaStatus, qtyAccepted: qaStatus === "QUARANTINE" ? null : Number(qtyAccepted), note: note || null, params: Object.keys(p).length ? p : null }) });
      toast({ title: `Line ${QA_STATUS_LABEL[qaStatus].toLowerCase()}`, description: qaStatus === "PASSED" && line.purchaseOrderLine.stockItemId ? "Stock updated for the accepted quantity" : undefined, variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Inspect: {line.purchaseOrderLine.description}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Result</Label>
              <Select value={qaStatus} onValueChange={(v) => setQaStatus(v as Exclude<QaStatus, "PENDING">)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="PASSED">Pass</SelectItem><SelectItem value="FAILED">Fail</SelectItem><SelectItem value="QUARANTINE">Quarantine (decide later)</SelectItem></SelectContent>
              </Select>
            </div>
            {qaStatus !== "QUARANTINE" && <div className="space-y-1.5"><Label>Accepted of {Number(line.quantity)}</Label><Input type="number" min="0" max={Number(line.quantity)} step="0.001" value={qtyAccepted} onChange={(e) => setQtyAccepted(e.target.value)} /></div>}
          </div>
          <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was found" /></div>
          <div className="space-y-1.5">
            <Label>Inspection parameters</Label>
            {params.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input className="h-9" placeholder="Parameter (seal, tread mm)" value={p.k} onChange={(e) => setParams((ps) => ps.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
                <Input className="h-9" placeholder="Reading" value={p.v} onChange={(e) => setParams((ps) => ps.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setParams((ps) => [...ps, { k: "", v: "" }])}>Add parameter</Button>
          </div>
          {qaStatus === "PASSED" && line.purchaseOrderLine.stockItemId && <p className="text-xs text-muted-foreground">Passing posts the accepted quantity to stock at the order price.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ line, onClose, onSaved }: { line: ReceiptLine; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const returnable = Number(line.qtyRejected) - line.returns.filter((x) => x.status !== "CLOSED").reduce((s, x) => s + Number(x.quantity), 0);
  const [quantity, setQuantity] = useState(String(returnable));
  const [reason, setReason] = useState(line.qaNote ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const rtv = await apiFetch<{ rtvNumber: string }>(`/api/procurement/receipt-lines/${line.id}/return`, { method: "POST", body: JSON.stringify({ quantity: Number(quantity), reason }) });
      toast({ title: `${rtv.rtvNumber} raised`, variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Return to vendor: {line.purchaseOrderLine.description}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Quantity (up to {returnable})</Label><Input type="number" min="0" max={returnable} step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || reason.length < 3 || Number(quantity) <= 0}>Raise return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
