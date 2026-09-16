"use client";
import { useState } from "react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Badge } from "@frontend/components/ui/badge";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { RTV_STATUS_LABEL, RTV_STATUS_VARIANT } from "@frontend/lib/labels";
import type { RtvStatus } from "@frontend/lib/enums";

interface Row {
  id: string; rtvNumber: string; quantity: string; reason: string; status: RtvStatus; shippedAt: string | null; creditNoteRef: string | null; creditAmount: string | null; version: number; createdAt: string;
  vendor: { code: string; legalName: string }; purchaseOrder: { poNumber: string }; goodsReceiptLine: { purchaseOrderLine: { description: string } };
}
const NEXT: Record<RtvStatus, RtvStatus | null> = { OPEN: "SHIPPED", SHIPPED: "CREDITED", CREDITED: "CLOSED", CLOSED: null };

/** Goods sent back after a failed inspection, and where each return stands. */
export function ReturnsPanel() {
  const { toast } = useToast();
  const [refresh, setRefresh] = useState(0);
  const [credit, setCredit] = useState<Record<string, { ref: string; amount: string }>>({});

  async function advance(r: Row) {
    const next = NEXT[r.status]; if (!next) return;
    try {
      const c = credit[r.id];
      await apiFetch(`/api/procurement/returns/${r.id}`, { method: "PATCH", body: JSON.stringify({ version: r.version, status: next, ...(next === "CREDITED" ? { creditNoteRef: c?.ref || null, creditAmount: c?.amount ? Number(c.amount) : null } : {}) }) });
      toast({ title: `${r.rtvNumber} ${RTV_STATUS_LABEL[next].toLowerCase()}`, variant: "success" });
      setRefresh((k) => k + 1);
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
  }

  const columns: Column<Row>[] = [
    { key: "rtvNumber", header: "Return", render: (r) => <span className="font-mono">{r.rtvNumber}</span> },
    { key: "purchaseOrder", header: "Order / vendor", render: (r) => <span><span className="font-mono">{r.purchaseOrder.poNumber}</span> <span className="text-muted-foreground">{r.vendor.legalName}</span></span> },
    { key: "line", header: "Item", render: (r) => <span>{r.goodsReceiptLine.purchaseOrderLine.description} <span className="text-muted-foreground">× {Number(r.quantity)}</span></span> },
    { key: "reason", header: "Reason", render: (r) => <span className="text-xs text-muted-foreground">{r.reason}</span> },
    { key: "credit", header: "Credit", render: (r) => r.creditNoteRef ? <span className="text-xs">{r.creditNoteRef}{r.creditAmount ? ` · ${Number(r.creditAmount).toLocaleString()}` : ""}</span> : r.status === "SHIPPED" ? (
      <span className="flex gap-1"><Input className="h-8 w-24" placeholder="Credit note" value={credit[r.id]?.ref ?? ""} onChange={(e) => setCredit((c) => ({ ...c, [r.id]: { ref: e.target.value, amount: c[r.id]?.amount ?? "" } }))} /><Input className="h-8 w-24" type="number" placeholder="Amount" value={credit[r.id]?.amount ?? ""} onChange={(e) => setCredit((c) => ({ ...c, [r.id]: { ref: c[r.id]?.ref ?? "", amount: e.target.value } }))} /></span>
    ) : "" },
    { key: "status", header: "Status", render: (r) => <Badge variant={RTV_STATUS_VARIANT[r.status]}>{RTV_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <DataTable<Row>
      endpoint="/api/procurement/returns/list"
      columns={columns}
      searchPlaceholder="Search by return number or vendor"
      refreshKey={refresh}
      rowActions={(r) => NEXT[r.status] ? <Button variant="outline" size="sm" onClick={() => advance(r)}>Mark {RTV_STATUS_LABEL[NEXT[r.status]!].toLowerCase()}</Button> : null}
    />
  );
}
