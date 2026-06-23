"use client";
import { useState } from "react";
import { Plus, FileText, Banknote } from "lucide-react";
import { DataTable, type Column } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_VARIANT } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/fetcher";
import type { InvoiceStatus } from "@prisma/client";

interface CustomerOpt { id: string; code: string; name: string; currency: string; }
interface Invoice {
  id: string; invoiceNumber: string; customer: { name: string };
  invoiceDate: string; dueDate: string | null; currency: string;
  total: string; paidAmount: string; status: InvoiceStatus;
}

const num = (v: string) => parseFloat(v).toLocaleString();

export function ReceivablesManager({ customers }: { customers: CustomerOpt[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  // create
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [vat, setVat] = useState("0");
  const [revenueCode, setRevenueCode] = useState("4000");
  const [postNow, setPostNow] = useState(false);

  // receive
  const [recvFor, setRecvFor] = useState<Invoice | null>(null);
  const [recvAmount, setRecvAmount] = useState("");
  const [bankCode, setBankCode] = useState("1010");

  const total = (parseFloat(subtotal || "0") + parseFloat(vat || "0")) || 0;

  function openCreate() {
    setCustomerId(""); setInvoiceDate(new Date().toISOString().slice(0, 10)); setDueDate("");
    setSubtotal(""); setVat("0"); setRevenueCode("4000"); setPostNow(false);
    setOpen(true);
  }

  async function createInvoice() {
    if (!customerId || !subtotal) { toast({ title: "Customer and subtotal are required", variant: "destructive" }); return; }
    try {
      await apiFetch("/api/receivables", {
        method: "POST",
        body: JSON.stringify({
          customerId, invoiceDate: new Date(invoiceDate).toISOString(),
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          subtotal, vatAmount: vat || "0", revenueCode, post: postNow,
        }),
      });
      toast({ title: postNow ? "Invoice posted" : "Invoice saved", variant: "success" });
      setOpen(false); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function post(inv: Invoice) {
    try {
      await apiFetch(`/api/receivables/${inv.id}`, { method: "POST", body: JSON.stringify({ action: "post" }) });
      toast({ title: "Invoice posted", variant: "success" }); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to post", variant: "destructive" });
    }
  }

  function openReceive(inv: Invoice) {
    setRecvFor(inv);
    setRecvAmount((parseFloat(inv.total) - parseFloat(inv.paidAmount)).toFixed(2));
    setBankCode("1010");
  }

  async function receive() {
    if (!recvFor || !recvAmount) return;
    try {
      await apiFetch(`/api/receivables/${recvFor.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "receive", amount: recvAmount, receivedAt: new Date().toISOString(), bankCode }),
      });
      toast({ title: "Receipt recorded", variant: "success" });
      setRecvFor(null); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to record", variant: "destructive" });
    }
  }

  const columns: Column<Invoice>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (r) => <span className="font-mono">{r.invoiceNumber}</span> },
    { key: "customer", header: "Customer", render: (r) => r.customer?.name ?? "" },
    { key: "invoiceDate", header: "Date", render: (r) => formatDate(r.invoiceDate) },
    { key: "dueDate", header: "Due", render: (r) => r.dueDate ? formatDate(r.dueDate) : "—" },
    { key: "total", header: "Total", render: (r) => `${r.currency} ${num(r.total)}` },
    { key: "paidAmount", header: "Received", render: (r) => num(r.paidAmount) },
    { key: "status", header: "Status", render: (r) => <Badge variant={INVOICE_STATUS_VARIANT[r.status]}>{INVOICE_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<Invoice>
        endpoint="/api/receivables"
        columns={columns}
        searchPlaceholder="Search by invoice or customer"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Invoice</Button>}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {row.status === "DRAFT" && <Button variant="outline" size="sm" onClick={() => post(row)}><FileText className="h-4 w-4" />Post</Button>}
            {(row.status === "POSTED" || row.status === "PARTIALLY_PAID") && <Button variant="outline" size="sm" onClick={() => openReceive(row)}><Banknote className="h-4 w-4" />Receive</Button>}
          </div>
        )}
      />

      {/* Create invoice */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Customer Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {customers.length === 0 && <SelectItem value="none" disabled>No active customers</SelectItem>}
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Revenue Account</Label><Input value={revenueCode} onChange={(e) => setRevenueCode(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Invoice Date</Label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Subtotal</Label><Input inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>VAT</Label><Input inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-elevated/40 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Invoice total (subtotal + VAT)</span>
              <span className="font-semibold tabular-nums">{total.toLocaleString()}</span>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} />
              Post to ledger now (Dr A/R / Cr revenue + VAT)
            </label>
          </div>
          <DialogFooter><Button onClick={createInvoice}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive */}
      <Dialog open={!!recvFor} onOpenChange={(o) => !o && setRecvFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Receive payment — {recvFor?.invoiceNumber}</DialogTitle></DialogHeader>
          {recvFor && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Outstanding: <span className="font-medium text-foreground">{recvFor.currency} {num((parseFloat(recvFor.total) - parseFloat(recvFor.paidAmount)).toString())}</span>
              </div>
              <div className="space-y-1.5"><Label>Amount</Label><Input inputMode="decimal" value={recvAmount} onChange={(e) => setRecvAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Bank Account (COA code)</Label><Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} /></div>
            </div>
          )}
          <DialogFooter><Button onClick={receive}>Record Receipt</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
