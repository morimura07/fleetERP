"use client";
import { useCallback, useEffect, useState } from "react";
import { Send, Lock, Ban, Plus, Trash2, Award, Star, Handshake, ShieldAlert } from "lucide-react";
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
import { RFQ_STATUS_LABEL, RFQ_STATUS_VARIANT, AVL_REGION_LABEL } from "@frontend/lib/labels";
import { type ApprovedVendor, type RfqDetail as Detail, type Comparison, type QuotationRow, money } from "./shared";

/**
 * One RFQ: the lines, the vendors invited, the quotes entered, and the
 * comparison matrix that leads to an award (SOP steps 6 to 12).
 */
export function RfqDetailDialog({ id, vendors, onClose, onChange, onAwarded }: { id: string; vendors: ApprovedVendor[]; onClose: () => void; onChange: () => void; onAwarded: (poId: string) => void }) {
  const { toast } = useToast();
  const fail = useCallback((e: unknown) => toast({ title: "Error", description: describeError(e), variant: "destructive" }), [toast]);
  const [rfq, setRfq] = useState<Detail | null>(null);
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteId, setInviteId] = useState("");
  const [quoting, setQuoting] = useState<string | null>(null); // vendorId
  const [negotiating, setNegotiating] = useState<QuotationRow | null>(null);
  const [justification, setJustification] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<Detail>(`/api/rfqs/${id}`);
      setRfq(d);
      setCmp(d.quotations.length > 0 || d.status !== "DRAFT" ? await apiFetch<Comparison>(`/api/rfqs/${id}/comparison`) : null);
    } catch (e) { fail(e); }
  }, [id, fail]);
  useEffect(() => { load(); }, [load]);

  async function act(path: string, label: string, body?: unknown, method = "POST") {
    setBusy(true);
    try {
      const res = await apiFetch<{ warning?: string | null }>(`/api/rfqs/${id}/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      toast({ title: label, description: res?.warning ?? undefined, variant: res?.warning ? "default" : "success" });
      onChange(); await load();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  async function award(quotationId: string) {
    setBusy(true);
    try {
      const po = await apiFetch<{ id: string; poNumber: string; status: string }>(`/api/rfqs/${id}/award`, { method: "POST", body: JSON.stringify({ quotationId }) });
      toast({ title: `Awarded: ${po.poNumber} raised`, description: "The purchase order is in the approval queue", variant: "success" });
      onChange(); onAwarded(po.id);
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  if (!rfq) return null;
  const invitable = vendors.filter((v) => !rfq.vendors.some((x) => x.vendorId === v.id));
  const open = ["DRAFT", "SENT", "CLOSED"].includes(rfq.status);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{rfq.rfqNumber}</span> {rfq.title}
            <Badge variant={RFQ_STATUS_VARIANT[rfq.status]}>{RFQ_STATUS_LABEL[rfq.status]}</Badge>
            {rfq.requisition && <span className="text-xs text-muted-foreground">from {rfq.requisition.prNumber}</span>}
            {rfq.deadline && <span className="text-xs text-muted-foreground">deadline {new Date(rfq.deadline).toLocaleDateString()}</span>}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={rfq.quotations.length > 0 ? "compare" : "vendors"}>
          <TabsList>
            <TabsTrigger value="vendors">Vendors &amp; quotes ({rfq.quotations.length}/{rfq.vendors.length})</TabsTrigger>
            <TabsTrigger value="compare">Comparison</TabsTrigger>
            <TabsTrigger value="lines">Lines ({rfq.lines.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="vendors" className="space-y-3 pt-3">
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-2 text-left">Vendor</th><th className="p-2 text-left">Region</th><th className="p-2 text-left">Status</th><th className="p-2 text-right">Quote</th><th className="p-2 text-right">Negotiated</th><th /></tr></thead>
                <tbody>
                  {rfq.vendors.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No vendors invited yet.</td></tr>}
                  {rfq.vendors.map((v) => {
                    const q = rfq.quotations.find((x) => x.vendorId === v.vendorId);
                    return (
                      <tr key={v.id} className="border-t">
                        <td className="p-2">{v.vendor.legalName} <span className="font-mono text-xs text-muted-foreground">{v.vendor.code}</span></td>
                        <td className="p-2 text-xs text-muted-foreground">{v.vendor.avlRegion ? AVL_REGION_LABEL[v.vendor.avlRegion] : ""}</td>
                        <td className="p-2"><Badge variant={v.status === "QUOTED" ? "success" : v.status === "DECLINED" ? "destructive" : "secondary"}>{v.status.toLowerCase()}</Badge></td>
                        <td className="p-2 text-right tabular-nums">{q ? money(q.subtotal, q.currency) : ""}</td>
                        <td className="p-2 text-right tabular-nums">{q?.negotiatedSubtotal ? money(q.negotiatedSubtotal, q.currency) : ""}</td>
                        <td className="p-2 text-right">
                          {open && (
                            <div className="flex justify-end gap-1">
                              {rfq.status !== "DRAFT" && <Button variant="outline" size="sm" disabled={busy} onClick={() => setQuoting(v.vendorId)}>{q ? "Re-enter quote" : "Enter quote"}</Button>}
                              {q && <Button variant="outline" size="sm" disabled={busy} onClick={() => setNegotiating(q)}><Handshake className="h-3.5 w-3.5" />Negotiate</Button>}
                              {!q && rfq.status !== "DRAFT" && v.status !== "DECLINED" && <Button variant="ghost" size="sm" disabled={busy} onClick={() => act("decline", "Marked declined", { vendorId: v.vendorId })}>Declined</Button>}
                              {!q && <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(`vendors/${v.vendorId}`, "Vendor removed", undefined, "DELETE")}><Trash2 className="h-3.5 w-3.5" /></Button>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {["DRAFT", "SENT"].includes(rfq.status) && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>Invite from the approved vendor list</Label>
                  <Select value={inviteId || undefined} onValueChange={setInviteId}>
                    <SelectTrigger><SelectValue placeholder={invitable.length ? "Pick a vendor" : "Every approved vendor is already invited"} /></SelectTrigger>
                    <SelectContent>{invitable.map((v) => <SelectItem key={v.id} value={v.id}>{v.code} · {v.legalName}{v.categories.length ? ` (${v.categories.join(", ")})` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button variant="outline" disabled={busy || !inviteId} onClick={async () => { await act("vendors", "Vendor invited", { vendorIds: [inviteId] }); setInviteId(""); }}><Plus className="h-4 w-4" />Invite</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="compare" className="space-y-3 pt-3">
            {!cmp || cmp.columns.length === 0 ? <p className="text-sm text-muted-foreground">No quotes yet.</p> : (
              <>
                <div className={`rounded-md border p-2 text-sm ${cmp.canAward ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                  {cmp.canAward ? `${cmp.quoteCount} quotes; the award may proceed.` : cmp.awardBlockedBy}
                  {rfq.singleSourceApprovedAt && <span className="ml-2 text-xs text-muted-foreground">Single-source justification on record: {rfq.singleSourceJustification}</span>}
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full whitespace-nowrap text-xs">
                    <thead className="bg-elevated/80 text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Line</th>
                        {cmp.columns.map((c) => <th key={c.quotationId} className="p-2 text-right">{c.vendorCode}<div className="font-normal normal-case">{c.vendorName}</div></th>)}
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {cmp.rows.map((r) => (
                        <tr key={r.rfqLineId} className="border-t">
                          <td className="p-2">{r.description} <span className="text-muted-foreground">× {Number(r.quantity)} {r.uom}</span></td>
                          {r.cells.map((cell) => (
                            <td key={cell.quotationId} className={`p-2 text-right ${cell.cheapest ? "bg-emerald-500/10 font-medium" : ""}`}>
                              {cell.unitPrice ? (
                                <>
                                  {cell.negotiatedUnitPrice ? <><s className="text-muted-foreground">{Number(cell.unitPrice).toLocaleString()}</s> {Number(cell.negotiatedUnitPrice).toLocaleString()}</> : Number(cell.unitPrice).toLocaleString()}
                                  <div className="text-muted-foreground">= {Number(cell.lineTotal).toLocaleString()}{cell.leadDays != null ? ` · ${cell.leadDays}d` : ""}</div>
                                </>
                              ) : <span className="text-muted-foreground">no price</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <Row label="Total" cells={cmp.columns.map((c) => c.negotiatedSubtotal ? `${money(c.negotiatedSubtotal, c.currency)} (was ${Number(c.subtotal).toLocaleString()})` : money(c.subtotal, c.currency))} bold cheapest={cmp.columns.map((c) => c.quotationId === cmp.cheapestQuotationId)} />
                      <Row label="Saving" cells={cmp.columns.map((c) => c.saving ? `${Number(c.saving).toLocaleString()} (${c.savingPct}%)` : "")} />
                      <Row label="Cheapest on" cells={cmp.columns.map((c) => `${c.cheapestLines} of ${cmp.rows.length} lines`)} />
                      <Row label="Delivery" cells={cmp.columns.map((c) => c.deliveryDays != null ? `${c.deliveryDays} days` : "")} />
                      <Row label="Terms" cells={cmp.columns.map((c) => [c.paymentTerms, c.incoterm].filter(Boolean).join(" · "))} />
                      <Row label="Valid until" cells={cmp.columns.map((c) => c.validUntil ? c.validUntil.slice(0, 10) : "")} />
                      <Row label="Technical / commercial" cells={cmp.columns.map((c) => `${c.technicalScore ?? "-"} / ${c.commercialScore ?? "-"}`)} />
                      <tr className="border-t">
                        <td className="p-2 text-muted-foreground">Decision</td>
                        {cmp.columns.map((c) => (
                          <td key={c.quotationId} className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              {open && <Button variant={c.isRecommended ? "default" : "outline"} size="sm" disabled={busy} title="Recommend" onClick={() => scoreQuote(c.quotationId, { isRecommended: !c.isRecommended })}><Star className="h-3.5 w-3.5" /></Button>}
                              {open && <Button size="sm" disabled={busy || !cmp.canAward} onClick={() => award(c.quotationId)}><Award className="h-3.5 w-3.5" />Award</Button>}
                              {rfq.awardedQuotationId === c.quotationId && <Badge variant="success">awarded</Badge>}
                            </div>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {open && !cmp.canAward && cmp.quoteCount > 0 && !rfq.singleSourceApprovedAt && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5"><Label>Single-source justification (authorised approver only)</Label><Input value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Why fewer than the policy's quotes will do" /></div>
                    <Button variant="outline" disabled={busy || justification.length < 10} onClick={() => act("single-source", "Justification recorded", { justification })}><ShieldAlert className="h-4 w-4" />Record</Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="lines" className="pt-3">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-2 text-left">Description</th><th className="p-2 text-left">UOM</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Account</th></tr></thead>
              <tbody>{rfq.lines.map((l) => <tr key={l.id} className="border-t"><td className="p-2">{l.description}{l.specification && <div className="text-xs text-muted-foreground">{l.specification}</div>}</td><td className="p-2">{l.uom}</td><td className="p-2 text-right tabular-nums">{Number(l.quantity)}</td><td className="p-2 font-mono text-xs">{l.expenseCode}</td></tr>)}</tbody>
            </table>
            <div className="mt-3"><AttachmentsPanel entityType="Rfq" entityId={rfq.id} /></div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-wrap gap-2">
          {rfq.status === "DRAFT" && <Button disabled={busy || rfq.vendors.length === 0} onClick={() => act("send", "RFQ sent")}><Send className="h-4 w-4" />Send to vendors</Button>}
          {rfq.status === "SENT" && <Button variant="outline" disabled={busy} onClick={() => act("close", "RFQ closed for quotes")}><Lock className="h-4 w-4" />Close</Button>}
          {open && <Button variant="ghost" disabled={busy} onClick={() => act("cancel", "RFQ cancelled")}><Ban className="h-4 w-4" />Cancel RFQ</Button>}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>

        {quoting && <QuoteDialog rfq={rfq} vendorId={quoting} onClose={() => setQuoting(null)} onSaved={async () => { onChange(); await load(); }} />}
        {negotiating && <NegotiateDialog rfq={rfq} quote={negotiating} onClose={() => setNegotiating(null)} onSaved={async () => { onChange(); await load(); }} />}
      </DialogContent>
    </Dialog>
  );

  async function scoreQuote(quotationId: string, body: { isRecommended?: boolean }) {
    setBusy(true);
    try { await apiFetch(`/api/rfqs/quotations/${quotationId}/score`, { method: "POST", body: JSON.stringify(body) }); await load(); }
    catch (e) { fail(e); }
    finally { setBusy(false); }
  }
}

function Row({ label, cells, bold, cheapest }: { label: string; cells: string[]; bold?: boolean; cheapest?: boolean[] }) {
  return (
    <tr className={`border-t ${bold ? "font-semibold" : ""}`}>
      <td className="p-2 text-muted-foreground">{label}</td>
      {cells.map((c, i) => <td key={i} className={`p-2 text-right ${cheapest?.[i] ? "bg-emerald-500/10" : ""}`}>{c}</td>)}
    </tr>
  );
}

function QuoteDialog({ rfq, vendorId, onClose, onSaved }: { rfq: Detail; vendorId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const existing = rfq.quotations.find((q) => q.vendorId === vendorId);
  const vendor = rfq.vendors.find((v) => v.vendorId === vendorId)?.vendor;
  const [quoteRef, setQuoteRef] = useState(existing?.quoteRef ?? "");
  const [deliveryDays, setDeliveryDays] = useState(existing?.deliveryDays != null ? String(existing.deliveryDays) : "");
  const [paymentTerms, setPaymentTerms] = useState(existing?.paymentTerms ?? "");
  const [incoterm, setIncoterm] = useState(existing?.incoterm ?? "");
  const [validUntil, setValidUntil] = useState(existing?.validUntil?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(rfq.lines.map((l) => [l.id, String(Number(existing?.lines.find((x) => x.rfqLineId === l.id)?.unitPrice ?? ""))])));
  const [busy, setBusy] = useState(false);
  const total = rfq.lines.reduce((s, l) => s + Number(l.quantity) * Number(prices[l.id] || 0), 0);

  async function submit() {
    setBusy(true);
    try {
      await apiFetch(`/api/rfqs/${rfq.id}/quotations`, {
        method: "POST",
        body: JSON.stringify({
          vendorId, quoteRef: quoteRef || null, deliveryDays: deliveryDays === "" ? null : Number(deliveryDays), paymentTerms: paymentTerms || null, incoterm: incoterm || null,
          validUntil: validUntil || null, notes: notes || null, lines: rfq.lines.map((l) => ({ rfqLineId: l.id, unitPrice: Number(prices[l.id]) })),
        }),
      });
      toast({ title: "Quote recorded", variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Quote from {vendor?.legalName}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Vendor&#39;s reference</Label><Input value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Delivery (days)</Label><Input type="number" min="0" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Valid until</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Payment terms</Label><Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="NET 30" /></div>
          <div className="space-y-1.5"><Label>Incoterm</Label><Input value={incoterm} onChange={(e) => setIncoterm(e.target.value.toUpperCase())} placeholder="CIF, DAP" /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-1 text-left">Line</th><th className="p-1 text-right">Qty</th><th className="p-1 text-right">Unit price ({rfq.currency})</th><th className="p-1 text-right">Total</th></tr></thead>
          <tbody className="tabular-nums">
            {rfq.lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-1">{l.description}</td>
                <td className="p-1 text-right">{Number(l.quantity)} {l.uom}</td>
                <td className="p-1 w-36"><Input className="h-9 text-right" type="number" min="0" step="0.01" value={prices[l.id] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} /></td>
                <td className="p-1 text-right">{(Number(l.quantity) * Number(prices[l.id] || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
            <tr className="border-t font-semibold"><td className="p-1" colSpan={3}>Total</td><td className="p-1 text-right">{money(total, rfq.currency)}</td></tr>
          </tbody>
        </table>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || rfq.lines.some((l) => prices[l.id] === "" || prices[l.id] == null || Number.isNaN(Number(prices[l.id])))}>Save quote</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NegotiateDialog({ rfq, quote, onClose, onSaved }: { rfq: Detail; quote: QuotationRow; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(quote.lines.map((l) => [l.rfqLineId, l.negotiatedUnitPrice ? String(Number(l.negotiatedUnitPrice)) : ""])));
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [tech, setTech] = useState(quote.technicalScore ? String(Number(quote.technicalScore)) : "");
  const [comm, setComm] = useState(quote.commercialScore ? String(Number(quote.commercialScore)) : "");
  const [busy, setBusy] = useState(false);
  const total = rfq.lines.reduce((s, l) => { const ql = quote.lines.find((x) => x.rfqLineId === l.id); const p = prices[l.id] !== "" ? Number(prices[l.id]) : Number(ql?.unitPrice ?? 0); return s + Number(l.quantity) * p; }, 0);

  async function submit() {
    setBusy(true);
    try {
      await apiFetch(`/api/rfqs/quotations/${quote.id}/negotiate`, { method: "POST", body: JSON.stringify({ notes: notes || null, lines: rfq.lines.map((l) => ({ rfqLineId: l.id, negotiatedUnitPrice: prices[l.id] === "" ? null : Number(prices[l.id]) })) }) });
      if (tech !== "" || comm !== "") await apiFetch(`/api/rfqs/quotations/${quote.id}/score`, { method: "POST", body: JSON.stringify({ ...(tech !== "" ? { technicalScore: Number(tech) } : {}), ...(comm !== "" ? { commercialScore: Number(comm) } : {}) }) });
      toast({ title: "Negotiation recorded", description: `Now ${money(total, quote.currency)} against ${money(quote.subtotal, quote.currency)} first quoted`, variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Negotiate with {quote.vendor.legalName}</DialogTitle></DialogHeader>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-1 text-left">Line</th><th className="p-1 text-right">First quoted</th><th className="p-1 text-right">Negotiated (blank = unchanged)</th></tr></thead>
          <tbody className="tabular-nums">
            {rfq.lines.map((l) => { const ql = quote.lines.find((x) => x.rfqLineId === l.id); return (
              <tr key={l.id} className="border-t">
                <td className="p-1">{l.description} <span className="text-muted-foreground">× {Number(l.quantity)}</span></td>
                <td className="p-1 text-right">{Number(ql?.unitPrice ?? 0).toLocaleString()}</td>
                <td className="p-1 w-40"><Input className="h-9 text-right" type="number" min="0" step="0.01" value={prices[l.id] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} /></td>
              </tr>
            ); })}
            <tr className="border-t font-semibold"><td className="p-1" colSpan={2}>Total after negotiation</td><td className="p-1 text-right">{money(total, quote.currency)}</td></tr>
          </tbody>
        </table>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>Technical score (0-100)</Label><Input type="number" min="0" max="100" value={tech} onChange={(e) => setTech(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Commercial score (0-100)</Label><Input type="number" min="0" max="100" value={comm} onChange={(e) => setComm(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
