"use client";
import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { DataTable, type Column } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { JOURNAL_STATUS_LABEL, JOURNAL_STATUS_VARIANT } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { apiFetch, ApiError } from "@/lib/fetcher";
import type { JournalStatus } from "@prisma/client";

interface AccountOpt { id: string; code: string; name: string; }
interface Line { id: string; accountId: string; debit: string; credit: string; account: { code: string; name: string }; memo?: string | null; }
interface Entry {
  id: string;
  voucherNumber: string;
  postingDate: string;
  currency: string;
  status: JournalStatus;
  memo?: string | null;
  lines: Line[];
}

interface DraftLine { accountId: string; debit: string; credit: string; memo: string; }

const emptyLine = (): DraftLine => ({ accountId: "", debit: "", credit: "", memo: "" });

export function LedgerManager({ accounts }: { accounts: AccountOpt[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  // draft entry state
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("USD");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005;

  function openCreate() {
    setPostingDate(new Date().toISOString().slice(0, 10));
    setCurrency("USD");
    setMemo("");
    setLines([emptyLine(), emptyLine()]);
    setOpen(true);
  }

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(post: boolean) {
    if (!balanced) {
      toast({ title: "Debits and credits do not balance", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/ledger", {
        method: "POST",
        body: JSON.stringify({
          postingDate: new Date(postingDate).toISOString(),
          currency,
          memo: memo || undefined,
          post,
          lines: lines
            .filter((l) => l.accountId && (l.debit || l.credit))
            .map((l) => ({
              accountId: l.accountId,
              debit: l.debit || "0",
              credit: l.credit || "0",
              memo: l.memo || undefined,
            })),
        }),
      });
      toast({ title: post ? "Entry posted" : "Draft saved", variant: "success" });
      setOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Failed to save", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function action(entry: Entry, act: "post" | "reverse") {
    if (act === "reverse" && !confirm(`Reverse entry ${entry.voucherNumber}? A contra-entry will be created.`)) return;
    try {
      await apiFetch(`/api/ledger/${entry.id}`, { method: "POST", body: JSON.stringify({ action: act }) });
      toast({ title: act === "post" ? "Entry posted" : "Entry reversed", variant: "success" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Error", description: e instanceof ApiError ? e.message : "Action failed", variant: "destructive" });
    }
  }

  const columns: Column<Entry>[] = [
    {
      key: "expand", header: "", render: (r) => (
        <button onClick={() => setExpanded((id) => (id === r.id ? null : r.id))} className="text-muted-foreground">
          {expanded === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ),
    },
    { key: "voucherNumber", header: "Voucher" },
    { key: "postingDate", header: "Posting Date", render: (r) => formatDate(r.postingDate) },
    { key: "currency", header: "Currency" },
    {
      key: "amount", header: "Amount", render: (r) =>
        r.lines.reduce((s, l) => s + parseFloat(l.debit), 0).toLocaleString(),
    },
    { key: "memo", header: "Memo", render: (r) => r.memo ?? "" },
    { key: "status", header: "Status", render: (r) => <Badge variant={JOURNAL_STATUS_VARIANT[r.status]}>{JOURNAL_STATUS_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <DataTable<Entry>
        endpoint="/api/ledger"
        columns={columns}
        searchPlaceholder="Search by voucher or memo"
        refreshKey={refreshKey}
        toolbar={<Button onClick={openCreate}><Plus className="h-4 w-4" />New Entry</Button>}
        rowActions={(row) => (
          <div className="flex flex-col items-end gap-1">
            <div className="flex justify-end gap-1">
              {row.status === "DRAFT" && <Button variant="outline" size="sm" onClick={() => action(row, "post")}>Post</Button>}
              {row.status === "POSTED" && <Button variant="ghost" size="sm" onClick={() => action(row, "reverse")}><Trash2 className="h-4 w-4 text-destructive" />Reverse</Button>}
            </div>
            {expanded === row.id && (
              <div className="mt-1 w-full rounded-md border bg-muted/30 p-2 text-left text-xs">
                {row.lines.map((l) => (
                  <div key={l.id} className="flex justify-between gap-4 py-0.5">
                    <span className="text-muted-foreground">{l.account.code} {l.account.name}</span>
                    <span>Dr {parseFloat(l.debit).toLocaleString()} / Cr {parseFloat(l.credit).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New Journal Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5"><Label>Posting Date</Label><Input type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></div>
              <div className="space-y-1.5"><Label>Memo</Label><Input value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr,7rem,7rem,2rem] gap-2 text-xs font-medium text-muted-foreground">
                <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span />
              </div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr,7rem,7rem,2rem] items-center gap-2">
                  <Select value={l.accountId} onValueChange={(v) => updateLine(i, { accountId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="text-right" inputMode="decimal" value={l.debit} onChange={(e) => updateLine(i, { debit: e.target.value, credit: "" })} />
                  <Input className="text-right" inputMode="decimal" value={l.credit} onChange={(e) => updateLine(i, { credit: e.target.value, debit: "" })} />
                  <Button variant="ghost" size="icon" disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus className="h-4 w-4" />Add Line</Button>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span>Total Debit {totalDebit.toLocaleString()} / Total Credit {totalCredit.toLocaleString()}</span>
              <Badge variant={balanced ? "success" : "destructive"}>{balanced ? "Balanced" : "Unbalanced"}</Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!balanced || submitting} onClick={() => submit(false)}>Save Draft</Button>
            <Button disabled={!balanced || submitting} onClick={() => submit(true)}>Post</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
