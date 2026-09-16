"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { DataTable, type Column } from "@frontend/components/data/data-table";
import { Button } from "@frontend/components/ui/button";
import { Badge } from "@frontend/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@frontend/components/ui/tabs";
import { RequisitionForm } from "./requisition-form";
import { RequisitionDetailDialog } from "./requisition-detail";
import { ApprovalQueue } from "./approval-queue";
import { DoaSettingsPanel } from "./doa-settings";
import { type ItemOpt, type RequisitionRow, STATUS_LABEL, STATUS_VARIANT, BUDGET_LABEL, money } from "./shared";

export function RequisitionsManager({ items }: { items: ItemOpt[] }) {
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const bump = () => setRefresh((k) => k + 1);

  const columns: Column<RequisitionRow>[] = [
    { key: "prNumber", header: "PR", render: (r) => <span className="font-mono">{r.prNumber}</span> },
    { key: "title", header: "Title", render: (r) => <span>{r.title}<span className="ml-2 text-xs text-muted-foreground">{r._count?.lines ?? 0} lines</span></span> },
    { key: "department", header: "Department", render: (r) => <span className="text-muted-foreground">{r.department ?? ""}{r.costCenter ? ` · ${r.costCenter}` : ""}</span> },
    { key: "subtotal", header: "Estimate", render: (r) => <span className="tabular-nums">{money(r.subtotal, r.currency)}</span> },
    { key: "budgetStatus", header: "Budget", render: (r) => <span className={`text-xs ${r.budgetStatus === "HARD_BLOCK" ? "text-red-400" : r.budgetStatus === "SOFT_BLOCK" ? "text-amber-400" : "text-muted-foreground"}`}>{BUDGET_LABEL[r.budgetStatus]}</span> },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    { key: "createdAt", header: "Raised", render: (r) => <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span> },
  ];

  return (
    <>
      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Requisitions</TabsTrigger>
          <TabsTrigger value="queue">My approvals</TabsTrigger>
          <TabsTrigger value="settings">Approval matrix &amp; policy</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="pt-4">
          <DataTable<RequisitionRow>
            endpoint="/api/requisitions"
            columns={columns}
            searchPlaceholder="Search by number, title or department"
            refreshKey={refresh}
            toolbar={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New requisition</Button>}
            rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setOpenId(r.id)}>Open</Button>}
          />
        </TabsContent>
        <TabsContent value="queue" className="pt-4">
          <ApprovalQueue key={refresh} onChanged={bump} onOpen={(type, id) => { if (type === "REQUISITION") setOpenId(id); }} />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <DoaSettingsPanel />
        </TabsContent>
      </Tabs>
      {creating && <RequisitionForm items={items} onClose={() => setCreating(false)} onSaved={(r) => { bump(); setOpenId(r.id); }} />}
      {openId && <RequisitionDetailDialog id={openId} items={items} onClose={() => setOpenId(null)} onChange={bump} />}
    </>
  );
}
