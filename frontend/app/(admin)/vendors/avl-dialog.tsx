"use client";
import { useState } from "react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { AttachmentsPanel } from "@frontend/components/data/attachments-panel";
import { apiFetch, describeError } from "@frontend/lib/fetcher";
import { AVL_STATUS_LABEL, AVL_STATUS_VARIANT, AVL_REGION_LABEL, KYC_STATUS_LABEL, KYC_STATUS_VARIANT } from "@frontend/lib/labels";
import type { AvlStatus, AvlRegion, KycStatus } from "@frontend/lib/enums";

export interface AvlVendor {
  id: string; code: string; legalName: string;
  avlStatus: AvlStatus; avlRegion: AvlRegion | null; kycStatus: KycStatus; kycVerifiedAt: string | null; kycNote: string | null; categories: string[];
}

/**
 * A vendor's place on the approved vendor list and its KYC (client
 * requirements, Sept 2026, Procurement §2). KYC documents attach to the
 * vendor; approval needs verified KYC.
 */
export function AvlDialog({ vendor, onClose, onSaved }: { vendor: AvlVendor; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [avlStatus, setAvlStatus] = useState<AvlStatus>(vendor.avlStatus);
  const [avlRegion, setAvlRegion] = useState<AvlRegion | "none">(vendor.avlRegion ?? "none");
  const [kycStatus, setKycStatus] = useState<KycStatus>(vendor.kycStatus);
  const [kycNote, setKycNote] = useState(vendor.kycNote ?? "");
  const [categories, setCategories] = useState((vendor.categories ?? []).join(", "));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await apiFetch(`/api/rfqs/vendors/${vendor.id}/avl`, {
        method: "PATCH",
        body: JSON.stringify({
          avlStatus, avlRegion: avlRegion === "none" ? null : avlRegion, kycStatus, kycNote: kycNote || null,
          categories: categories.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
        }),
      });
      toast({ title: "Vendor updated", variant: "success" });
      onSaved(); onClose();
    } catch (e) { toast({ title: "Error", description: describeError(e), variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {vendor.legalName} <span className="font-mono text-sm text-muted-foreground">{vendor.code}</span>
            <Badge variant={AVL_STATUS_VARIANT[vendor.avlStatus]}>{AVL_STATUS_LABEL[vendor.avlStatus]}</Badge>
            <Badge variant={KYC_STATUS_VARIANT[vendor.kycStatus]}>KYC {KYC_STATUS_LABEL[vendor.kycStatus].toLowerCase()}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>KYC status</Label>
            <Select value={kycStatus} onValueChange={(v) => setKycStatus(v as KycStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(KYC_STATUS_LABEL) as KycStatus[]).map((k) => <SelectItem key={k} value={k}>{KYC_STATUS_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
            {vendor.kycVerifiedAt && <p className="text-[11px] text-muted-foreground">Verified {new Date(vendor.kycVerifiedAt).toLocaleDateString()}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Approved vendor list</Label>
            <Select value={avlStatus} onValueChange={(v) => setAvlStatus(v as AvlStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(AVL_STATUS_LABEL) as AvlStatus[]).map((k) => <SelectItem key={k} value={k}>{AVL_STATUS_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Approval needs verified KYC. Only approved vendors can be invited to quote.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Region</Label>
            <Select value={avlRegion} onValueChange={(v) => setAvlRegion(v as AvlRegion | "none")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {(Object.keys(AVL_REGION_LABEL) as AvlRegion[]).map((k) => <SelectItem key={k} value={k}>{AVL_REGION_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Supply categories</Label><Input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="TYRES, FUEL, SPARES" /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>KYC note</Label><Input value={kycNote} onChange={(e) => setKycNote(e.target.value)} placeholder="What was checked, or why it was rejected" /></div>
        </div>
        <div>
          <h4 className="mb-1 text-sm font-medium">KYC documents</h4>
          <AttachmentsPanel entityType="Vendor" entityId={vendor.id} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={save} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
