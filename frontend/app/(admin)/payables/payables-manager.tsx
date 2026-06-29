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

interface VendorOpt { id: string; code: string; legalName: string; currency: string; }
interface Bill {
  id: string; invoiceNumber: string; vendor: { legalName: string };
  invoiceDate: string; dueDate: string | null; currency: string;
  total: string; paidAmount: string; status: InvoiceStatus;
}

const num = (v: string) => parseFloat(v).toLocaleString();

export function PayablesManager({ vendors }: { vendors: VendorOpt[] }) {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);

  // create
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [vat, setVat] = useState("0");
  const [wht, setWht] = useState("0");
  const [expenseCode, setExpenseCode] = useState("6100");
  const [postNow, setPostNow] = useState(false);

  // pay
  const [payFor, setPayFor] = useState<Bill | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [bankCode, setBankCode] = useState("1010");

  const net = (parseFloat(subtotal || "0") + parseFloat(vat || "0") - parseFloat(wht || "0")) || 0;

  function openCreate() {
    setVendorId(""); setInvoiceNumber(""); setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDueDate(""); setSubtotal(""); setVat("0"); setWht("0"); setExpenseCode("6100"); setPostNow(false);
    setOpen(true);
  }

  async function createBill() {
    if (!vendorId || !invoiceNumber || !subtotal) { toast({ title: "Vendor, number and subtotal are required", variant: "destructive" }); return; }
    try {
      await apiFetch("/api/payables", {
        method: "POST",
        body: JSON.stringify({
          vendorId, invoiceNumber, invoiceDate: new Date(invoiceDate).toISOString(),
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          subtotal, vatAmount: vat || "0", whtAmount: wht || "0", expenseCode, post: postNow,
        }),
      });
      toast({ title: postNow ? "Bill posted" : "Bill saved", variant: "success" });
      setOpen(false); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    }
  }

  async function post(b: Bill) {
    try {
      await apiFetch(`/api/payables/${b.id}`, { method: "POST", body: JSON.stringify({ action: "post" }) });
      toast({ title: "Bill posted", variant: "success" }); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to post", variant: "destructive" });
    }
  }

  function openPay(b: Bill) {
    setPayFor(b);
    setPayAmount((parseFloat(b.total) - parseFloat(b.paidAmount)).toFixed(2));
    setBankCode("1010");
  }

  async function pay() {
    if (!payFor || !payAmount) return;
    try {
      await apiFetch(`/api/payables/${payFor.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "pay", amount: payAmount, paidAt: new Date().toISOString(), bankCode }),
      });
      toast({ title: "Payment recorded", variant: "success" });
      setPayFor(null); setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to pay", variant: "destructive" });
    }
  }

  const columns: Column<Bill>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (r) => <span className="font-mono">{r.invoiceNumber}</span> },
    { key: "vendor", header: "Vendor", render: (r) => r.vendor?.legalName ?? "" },
    { key: "invoiceDate", header: "Date", render: (r) => formatDate(r.invoiceDate) },
    { key: "dueDate", header: "Due", render: (r) => r.dueDate ? formatDate(r.dueDate) : "—" },
    { key: "total", header: "Total", render: (r) => `${r.currency} ${num(r.total)}` },
    { key: "paidAmount", header: "Paid", render: (r) => num(r.paidAmount) },
    { key: "status", header: "Status", render: (r) => <Badge variant={INVOICE_STATUS_VARIANT[r.status]}>{INVOICE_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<Bill>
        endpoint="/api/payables"
        columns={columns}
        searchPlaceholder="Search by invoice or vendor"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Bill</Button>}
        rowActions={(row) => (
          <div className="flex justify-end gap-1">
            {row.status === "DRAFT" && <Button variant="outline" size="sm" onClick={() => post(row)}><FileText className="h-4 w-4" />Post</Button>}
            {(row.status === "POSTED" || row.status === "PARTIALLY_PAID") && <Button variant="outline" size="sm" onClick={() => openPay(row)}><Banknote className="h-4 w-4" />Pay</Button>}
          </div>
        )}
      />

      {/* Create bill */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Vendor Bill</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {vendors.length === 0 && <SelectItem value="none" disabled>No active vendors</SelectItem>}
                    {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.code} — {v.legalName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Invoice No.</Label><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Invoice Date</Label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Subtotal</Label><Input inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Expense Account</Label><Input value={expenseCode} onChange={(e) => setExpenseCode(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>VAT</Label><Input inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Withholding Tax</Label><Input inputMode="decimal" value={wht} onChange={(e) => setWht(e.target.value)} /></div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-elevated/40 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">Net payable (subtotal + VAT − WHT)</span>
              <span className="font-semibold tabular-nums">{net.toLocaleString()}</span>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} />
              Post to ledger now (Dr expense / Cr A/P)
            </label>
          </div>
          <DialogFooter><Button onClick={createBill}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pay {payFor?.invoiceNumber}</DialogTitle></DialogHeader>
          {payFor && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Outstanding: <span className="font-medium text-foreground">{payFor.currency} {num((parseFloat(payFor.total) - parseFloat(payFor.paidAmount)).toString())}</span>
              </div>
              <div className="space-y-1.5"><Label>Amount</Label><Input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Bank Account (COA code)</Label><Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} /></div>
            </div>
          )}
          <DialogFooter><Button onClick={pay}>Record Payment</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
