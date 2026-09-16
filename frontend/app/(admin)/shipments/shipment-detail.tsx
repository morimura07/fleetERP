"use client";
import { useCallback, useEffect, useState } from "react";
import { Ship, CheckCircle2, Trash2, Plus, MapPin, Calculator, ShieldCheck } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@frontend/components/ui/tabs";
import { useToast } from "@frontend/components/ui/toast";
import { AttachmentsPanel } from "@frontend/components/data/attachments-panel";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { SHIPMENT_MODE_LABEL, SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_VARIANT, CLEARANCE_STATUS_LABEL, SHIPMENT_DOC_LABEL } from "@frontend/lib/labels";
import type { ShipmentStatus, ClearanceStatus, ShipmentDocType } from "@frontend/lib/enums";

export interface ShipmentDoc { id: string; docType: ShipmentDocType; reference: string | null; attachmentId: string | null; verified: boolean; verifiedAt: string | null; note: string | null }
export interface ShipmentEvent { id: string; kind: string; at: string; status: string | null; location: string | null; note: string | null; userName: string | null }
export interface ShipmentData {
  id: string; shipmentNumber: string; status: ShipmentStatus; mode: keyof typeof SHIPMENT_MODE_LABEL; incoterm: string | null; carrier: string | null; vesselOrFlight: string | null; containerNo: string | null; transportDocNo: string | null;
  portOfLoading: string | null; portOfDischarge: string | null; etd: string | null; eta: string | null; atd: string | null; ata: string | null; deliveredAt: string | null;
  clearanceStatus: ClearanceStatus; clearanceRef: string | null; clearanceNote: string | null; dutyCurrency: string; dutyEstimate: string | null; dutyPaid: string | null; dutyPaidAt: string | null;
  customsValue: string | null; dutyRatePct: string | null; vatRatePct: string | null; otherChargesEst: string | null; notes: string | null; version: number;
  purchaseOrder: { id: string; poNumber: string; status: string; currency: string; subtotal: string; vendor: { code: string; legalName: string } };
  clearingAgent: { code: string; legalName: string } | null;
  documents: ShipmentDoc[]; events: ShipmentEvent[];
  checklist: { required: { docType: string; present: boolean; verified: boolean }[]; complete: boolean; blocking: string | null };
}

const NEXT: Record<ShipmentStatus, ShipmentStatus | null> = { PLANNED: "IN_TRANSIT", IN_TRANSIT: "ARRIVED", ARRIVED: "CLEARING", CLEARING: "CLEARED", CLEARED: "DELIVERED", DELIVERED: null, CANCELLED: null };
const money = (v: string | number | null, c: string) => (v == null ? "-" : `${c} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const d = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");

/** One consignment: plan, papers (the GRN checklist), clearing and duty, and the log. */
export function ShipmentDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);
  const [s, setS] = useState<ShipmentData | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [docType, setDocType] = useState<ShipmentDocType>("TRANSPORT_DOCUMENT");
  const [docRef, setDocRef] = useState("");
  const [clearance, setClearance] = useState<ClearanceStatus>("DOCS_LODGED");
  const [clearanceRef, setClearanceRef] = useState("");
  const [duty, setDuty] = useState({ customsValue: "", dutyRatePct: "", vatRatePct: "", otherChargesEst: "", dutyPaid: "" });
  const [dutyPreview, setDutyPreview] = useState<{ duty: string; vat: string; other: string; total: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ShipmentData>(`/api/shipments/${id}`);
      setS(data);
      setDuty({ customsValue: data.customsValue ? String(Number(data.customsValue)) : String(Number(data.purchaseOrder.subtotal)), dutyRatePct: data.dutyRatePct ? String(Number(data.dutyRatePct)) : "", vatRatePct: data.vatRatePct ? String(Number(data.vatRatePct)) : "", otherChargesEst: data.otherChargesEst ? String(Number(data.otherChargesEst)) : "", dutyPaid: data.dutyPaid ? String(Number(data.dutyPaid)) : "" });
      setClearance(data.clearanceStatus === "NOT_STARTED" ? "DOCS_LODGED" : data.clearanceStatus);
    } catch (e) { fail(e); }
  }, [id, fail]);
  useEffect(() => { load(); }, [load]);

  async function act(path: string, label: string, body?: unknown, method = "POST") {
    setBusy(true);
    try {
      await apiFetch(`/api/shipments/${id}/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      toast({ title: label, variant: "success" });
      setNote(""); setLocation(""); onChange(); await load();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  async function previewDuty() {
    try {
      setDutyPreview(await apiFetch("/api/shipments/estimate-duty", { method: "POST", body: JSON.stringify({ customsValue: Number(duty.customsValue), dutyRatePct: Number(duty.dutyRatePct), vatRatePct: duty.vatRatePct === "" ? null : Number(duty.vatRatePct), otherChargesEst: duty.otherChargesEst === "" ? null : Number(duty.otherChargesEst) }) }));
    } catch (e) { fail(e); }
  }

  if (!s) return null;
  const next = NEXT[s.status];
  const open = !["DELIVERED", "CANCELLED"].includes(s.status);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Ship className="h-5 w-5" /><span className="font-mono">{s.shipmentNumber}</span>
            <Badge variant={SHIPMENT_STATUS_VARIANT[s.status]}>{SHIPMENT_STATUS_LABEL[s.status]}</Badge>
            <span className="text-sm text-muted-foreground">{s.purchaseOrder.poNumber} · {s.purchaseOrder.vendor.legalName}</span>
            <Badge variant={s.checklist.complete ? "success" : "warning"}>{s.checklist.complete ? "papers complete" : "papers incomplete"}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <Fact label="Mode / incoterm" value={`${SHIPMENT_MODE_LABEL[s.mode]}${s.incoterm ? ` · ${s.incoterm}` : ""}`} />
          <Fact label="Carrier" value={[s.carrier, s.vesselOrFlight].filter(Boolean).join(" · ") || "-"} />
          <Fact label="Container / doc" value={[s.containerNo, s.transportDocNo].filter(Boolean).join(" · ") || "-"} />
          <Fact label="Route" value={`${s.portOfLoading ?? "?"} → ${s.portOfDischarge ?? "?"}`} />
          <Fact label="ETD / ATD" value={`${d(s.etd)} / ${d(s.atd)}`} />
          <Fact label="ETA / ATA" value={`${d(s.eta)} / ${d(s.ata)}`} />
          <Fact label="Clearing agent" value={s.clearingAgent?.legalName ?? "-"} />
          <Fact label="Clearance" value={CLEARANCE_STATUS_LABEL[s.clearanceStatus]} hint={s.clearanceRef ? `entry ${s.clearanceRef}` : undefined} />
        </div>

        <Tabs defaultValue="papers">
          <TabsList>
            <TabsTrigger value="papers">Papers ({s.documents.filter((x) => x.verified).length}/{s.documents.length})</TabsTrigger>
            <TabsTrigger value="customs">Customs &amp; duty</TabsTrigger>
            <TabsTrigger value="log">Log ({s.events.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="papers" className="space-y-3 pt-3">
            <div className={`rounded-md border p-2 text-sm ${s.checklist.complete ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              {s.checklist.blocking ?? (s.checklist.complete ? "Every required paper is verified; goods may be received." : "The checklist is not enforced by the policy.")}
              <div className="mt-1 flex flex-wrap gap-1">
                {s.checklist.required.map((r) => <Badge key={r.docType} variant={r.verified ? "success" : r.present ? "warning" : "secondary"}>{SHIPMENT_DOC_LABEL[r.docType as ShipmentDocType] ?? r.docType}: {r.verified ? "verified" : r.present ? "unverified" : "missing"}</Badge>)}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-2 text-left">Document</th><th className="p-2 text-left">Reference</th><th className="p-2 text-left">Verified</th><th /></tr></thead>
              <tbody>
                {s.documents.length === 0 && <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">No documents recorded yet. Upload the file below, then add it here by type.</td></tr>}
                {s.documents.map((doc) => (
                  <tr key={doc.id} className="border-t">
                    <td className="p-2">{SHIPMENT_DOC_LABEL[doc.docType]}</td>
                    <td className="p-2 font-mono text-xs">{doc.reference ?? ""}{doc.note && <div className="font-sans text-muted-foreground">{doc.note}</div>}</td>
                    <td className="p-2">{doc.verified ? <Badge variant="success">verified {doc.verifiedAt ? d(doc.verifiedAt) : ""}</Badge> : <Badge variant="secondary">not yet</Badge>}</td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant={doc.verified ? "ghost" : "outline"} size="sm" disabled={busy} title={doc.verified ? "Withdraw verification" : "Verify"} onClick={() => act(`documents/${doc.id}/verify`, doc.verified ? "Verification withdrawn" : "Document verified", { verified: !doc.verified })}><ShieldCheck className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(`documents/${doc.id}`, "Document removed", undefined, "DELETE")}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {open && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] space-y-1"><Label className="text-xs">Type</Label>
                  <Select value={docType} onValueChange={(v) => setDocType(v as ShipmentDocType)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(SHIPMENT_DOC_LABEL) as ShipmentDocType[]).map((k) => <SelectItem key={k} value={k}>{SHIPMENT_DOC_LABEL[k]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1"><Label className="text-xs">Reference number</Label><Input className="h-9" value={docRef} onChange={(e) => setDocRef(e.target.value)} /></div>
                <Button size="sm" disabled={busy} onClick={async () => { await act("documents", "Document added", { docType, reference: docRef || null }); setDocRef(""); }}><Plus className="h-3.5 w-3.5" />Add</Button>
              </div>
            )}
            <AttachmentsPanel entityType="Shipment" entityId={s.id} />
          </TabsContent>

          <TabsContent value="customs" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="space-y-1"><Label className="text-xs">Customs value ({s.dutyCurrency})</Label><Input className="h-9" type="number" value={duty.customsValue} onChange={(e) => setDuty((x) => ({ ...x, customsValue: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Duty rate %</Label><Input className="h-9" type="number" value={duty.dutyRatePct} onChange={(e) => setDuty((x) => ({ ...x, dutyRatePct: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">VAT %</Label><Input className="h-9" type="number" value={duty.vatRatePct} onChange={(e) => setDuty((x) => ({ ...x, vatRatePct: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Other charges</Label><Input className="h-9" type="number" value={duty.otherChargesEst} onChange={(e) => setDuty((x) => ({ ...x, otherChargesEst: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Duty paid</Label><Input className="h-9" type="number" value={duty.dutyPaid} onChange={(e) => setDuty((x) => ({ ...x, dutyPaid: e.target.value }))} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={!duty.customsValue || !duty.dutyRatePct} onClick={previewDuty}><Calculator className="h-3.5 w-3.5" />Calculate</Button>
              {dutyPreview && <span className="text-muted-foreground">duty {dutyPreview.duty} + VAT {dutyPreview.vat} + other {dutyPreview.other} = <span className="font-semibold text-foreground">{money(dutyPreview.total, s.dutyCurrency)}</span></span>}
              <Button size="sm" disabled={busy || !duty.customsValue || !duty.dutyRatePct} onClick={() => act("duty", "Duty recorded", { customsValue: Number(duty.customsValue), dutyRatePct: Number(duty.dutyRatePct), vatRatePct: duty.vatRatePct === "" ? null : Number(duty.vatRatePct), otherChargesEst: duty.otherChargesEst === "" ? null : Number(duty.otherChargesEst), dutyPaid: duty.dutyPaid === "" ? null : Number(duty.dutyPaid) })}>Record on shipment</Button>
              <span className="ml-auto">Estimate {money(s.dutyEstimate, s.dutyCurrency)} · paid {money(s.dutyPaid, s.dutyCurrency)}{s.dutyPaidAt ? ` on ${d(s.dutyPaidAt)}` : ""}</span>
            </div>
            {open && (
              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <div className="min-w-[200px] space-y-1"><Label className="text-xs">Clearance step</Label>
                  <Select value={clearance} onValueChange={(v) => setClearance(v as ClearanceStatus)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(CLEARANCE_STATUS_LABEL) as ClearanceStatus[]).filter((k) => k !== "NOT_STARTED").map((k) => <SelectItem key={k} value={k}>{CLEARANCE_STATUS_LABEL[k]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Customs entry no.</Label><Input className="h-9" value={clearanceRef} onChange={(e) => setClearanceRef(e.target.value)} placeholder={s.clearanceRef ?? ""} /></div>
                <div className="flex-1 space-y-1"><Label className="text-xs">Note</Label><Input className="h-9" value={note} onChange={(e) => setNote(e.target.value)} /></div>
                <Button size="sm" disabled={busy} onClick={() => act("clearance", "Clearance updated", { clearanceStatus: clearance, clearanceRef: clearanceRef || null, note: note || null })}>Update clearance</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="log" className="space-y-3 pt-3">
            {open && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1"><Label className="text-xs">Container seen at</Label><Input className="h-9" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Port, depot, border" /></div>
                <div className="flex-1 space-y-1"><Label className="text-xs">Note</Label><Input className="h-9" value={note} onChange={(e) => setNote(e.target.value)} /></div>
                <Button variant="outline" size="sm" disabled={busy || (!location && !note)} onClick={() => act("events", "Logged", { kind: location ? "LOCATION" : "NOTE", location: location || null, note: note || null })}><MapPin className="h-3.5 w-3.5" />Log</Button>
              </div>
            )}
            <ul className="space-y-1 text-sm">
              {s.events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-2 border-t py-1">
                  <span className="w-36 shrink-0 text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
                  <Badge variant="secondary">{e.kind.toLowerCase()}</Badge>
                  <span>{[e.status && e.status.replace(/_/g, " ").toLowerCase(), e.location, e.note].filter(Boolean).join(" · ")}</span>
                  {e.userName && <span className="ml-auto text-xs text-muted-foreground">{e.userName}</span>}
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-wrap gap-2">
          {open && next && (
            <Button disabled={busy} title={next === "DELIVERED" && s.checklist.blocking ? s.checklist.blocking : undefined} onClick={() => act("status", `Now ${SHIPMENT_STATUS_LABEL[next].toLowerCase()}`, { status: next, note: note || null, location: location || null })}>
              <CheckCircle2 className="h-4 w-4" />Mark {SHIPMENT_STATUS_LABEL[next].toLowerCase()}
            </Button>
          )}
          {open && <Button variant="ghost" disabled={busy} onClick={() => act("status", "Shipment cancelled", { status: "CANCELLED", note: note || null })}>Cancel shipment</Button>}
          <Button variant="outline" onClick={onClose}>Close</Button>
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
