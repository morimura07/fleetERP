"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { CurrencySelect } from "@frontend/components/ui/currency-select";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { RFQ_STATUS_LABEL, RFQ_STATUS_VARIANT } from "@frontend/lib/labels";
import { RfqDetailDialog } from "./rfq-detail";
import { type ApprovedVendor, type ItemOpt, type RequisitionOpt, type RfqRow, type RfqDetail } from "./shared";

export function RfqsManager({ items }: { items: ItemOpt[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [refresh, setRefresh] = useState(0);
  const [vendors, setVendors] = useState<ApprovedVendor[]>([]);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const bump = () => setRefresh((k) => k + 1);

  useEffect(() => {
    apiFetch<ApprovedVendor[]>("/api/rfqs/vendors/approved").then(setVendors).catch((e) => toast({ title: "Error", description: describeError(e), variant: "destructive" }));
  }, [refresh, toast]);

  const columns: Column<RfqRow>[] = [
    { key: "rfqNumber", header: "RFQ", render: (r) => <span className="font-mono">{r.rfqNumber}</span> },
    { key: "title", header: "Title", render: (r) => <span>{r.title}{r.requisition && <span className="ml-2 font-mono text-xs text-muted-foreground">{r.requisition.prNumber}</span>}</span> },
    { key: "vendors", header: "Quotes", render: (r) => <span className="tabular-nums">{r._count?.quotations ?? 0} of {r._count?.vendors ?? 0} vendors</span> },
    { key: "deadline", header: "Deadline", render: (r) => <span className="text-xs text-muted-foreground">{r.deadline ? new Date(r.deadline).toLocaleDateString() : ""}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={RFQ_STATUS_VARIANT[r.status]}>{RFQ_STATUS_LABEL[r.status]}</Badge> },
    { key: "createdAt", header: "Raised", render: (r) => <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span> },
  ];

  return (
    <>
      <DataTable<RfqRow>
        endpoint="/api/rfqs"
        columns={columns}
        searchPlaceholder="Search by number or title"
        refreshKey={refresh}
        toolbar={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New RFQ</Button>}
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setOpenId(r.id)}>Open</Button>}
      />
      {vendors.length < 3 && <p className="mt-2 text-xs text-muted-foreground">{vendors.length} vendor(s) on the approved list. Approve vendors under Vendors (KYC verified) to invite them.</p>}
      {creating && <CreateRfqDialog items={items} vendors={vendors} onClose={() => setCreating(false)} onSaved={(r) => { bump(); setOpenId(r.id); }} />}
      {openId && <RfqDetailDialog id={openId} vendors={vendors} onClose={() => setOpenId(null)} onChange={bump} onAwarded={() => { setOpenId(null); router.push("/procurement"); }} />}
    </>
  );
}

function CreateRfqDialog({ items, vendors, onClose, onSaved }: { items: ItemOpt[]; vendors: ApprovedVendor[]; onClose: () => void; onSaved: (r: RfqDetail) => void }) {
  const { toast } = useToast();
  const [requisitions, setRequisitions] = useState<RequisitionOpt[]>([]);
  const [requisitionId, setRequisitionId] = useState("");
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [lines, setLines] = useState<{ stockItemId: string | null; description: string; uom: string; quantity: string; expenseCode: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<RequisitionOpt[]>("/api/requisitions?status=APPROVED&pageSize=100").then(setRequisitions).catch(() => setRequisitions([]));
  }, []);

  const pickReq = (id: string) => {
    setRequisitionId(id);
    const r = requisitions.find((x) => x.id === id);
    if (r) { setTitle((t) => t || r.title); setCurrency(r.currency); setLines([]); }
  };
  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const toggleVendor = (id: string) => setVendorIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  async function submit() {
    setBusy(true);
    try {
      const r = await apiFetch<RfqDetail>("/api/rfqs", {
        method: "POST",
        body: JSON.stringify({ requisitionId: requisitionId || null, title, currency, deadline: deadline || null, notes: notes || null, vendorIds, lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity) })) }),
      });
      toast({ title: `${r.rfqNumber} created`, description: vendorIds.length < 3 ? "Fewer than three vendors; the award will need a single-source justification unless more are invited" : undefined, variant: "success" });
      onSaved(r); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>New request for quotation</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label>From an approved requisition (optional)</Label>
              <Select value={requisitionId || "none"} onValueChange={(v) => pickReq(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Free-standing RFQ</SelectItem>
                  {requisitions.map((r) => <SelectItem key={r.id} value={r.id}>{r.prNumber} · {r.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {requisitionId && <p className="text-[11px] text-muted-foreground">The requisition&#39;s lines are copied and it moves to Sourcing.</p>}
            </div>
            <div className="space-y-1.5"><Label>Currency</Label><CurrencySelect value={currency} onChange={setCurrency} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Quote deadline</Label><Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
            <div className="space-y-1.5 md:col-span-3"><Label>Notes to vendors</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>

          <div className="space-y-1.5">
            <Label>Vendors to invite ({vendorIds.length} picked; the policy expects three quotes)</Label>
            <div className="flex flex-wrap gap-1">
              {vendors.length === 0 && <span className="text-xs text-muted-foreground">No approved vendors yet.</span>}
              {vendors.map((v) => (
                <button key={v.id} type="button" onClick={() => toggleVendor(v.id)} className={`rounded border px-2 py-1 text-xs ${vendorIds.includes(v.id) ? "border-primary bg-primary/15" : "text-muted-foreground"}`}>
                  {v.code} · {v.legalName}{v.categories.length ? ` (${v.categories.join(", ")})` : ""}
                </button>
              ))}
            </div>
          </div>

          {!requisitionId && (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">Description</th><th className="p-2 text-left">UOM</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Account</th><th /></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1 min-w-[160px]">
                        <Select value={l.stockItemId ?? "free"} onValueChange={(v) => { const it = items.find((x) => x.id === v); setLine(i, it ? { stockItemId: it.id, description: it.name, uom: it.unit, expenseCode: it.expenseCode } : { stockItemId: null }); }}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="free">Free text</SelectItem>{items.map((it) => <SelectItem key={it.id} value={it.id}>{it.code} · {it.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="p-1"><Input className="h-9" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                      <td className="p-1 w-24"><Input className="h-9" value={l.uom} onChange={(e) => setLine(i, { uom: e.target.value.toUpperCase() })} /></td>
                      <td className="p-1 w-24"><Input className="h-9 text-right" type="number" min="0" step="0.001" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                      <td className="p-1 w-24"><Input className="h-9" value={l.expenseCode} onChange={(e) => setLine(i, { expenseCode: e.target.value })} /></td>
                      <td className="p-1"><Button variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t p-2"><Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { stockItemId: null, description: "", uom: "PIECE", quantity: "1", expenseCode: "5100" }])}><Plus className="h-3.5 w-3.5" />Add line</Button></div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title || (!requisitionId && (lines.length === 0 || lines.some((l) => !l.description)))}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
