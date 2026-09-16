"use client";
import { useCallback, useEffect, useState } from "react";
import { Building2, Mail, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";

export type PartyType = "clients" | "vendors";

export interface PartySite {
  id: string; version: number;
  name: string; kind: string;
  street: string | null; city: string | null; region: string | null;
  postalCode: string | null; country: string | null;
  phone: string | null; email: string | null;
  isPrimary: boolean; notes: string | null;
}

export interface PartyContact {
  id: string; version: number;
  name: string; title: string | null;
  phone: string | null; mobile: string | null; email: string | null;
  role: string; isPrimary: boolean;
  notifyDeliveryStatus: boolean; notifyInvoices: boolean;
  notes: string | null;
}

const SITE_KINDS = [
  ["HEADQUARTERS", "Head office"], ["BRANCH", "Branch"], ["WAREHOUSE", "Warehouse"],
  ["FACTORY", "Factory"], ["PORT", "Port"], ["YARD", "Yard"], ["OTHER", "Other"],
] as const;

const CONTACT_ROLES = [
  ["PRIMARY", "Primary"], ["BILLING", "Billing"], ["OPERATIONS", "Operations"],
  ["CLAIMS", "Claims"], ["OTHER", "Other"],
] as const;

/** "12 Nyerere Rd, Dar es Salaam, TZ" from whichever parts were filled in. */
function addressLine(s: PartySite): string {
  return [s.street, s.city, s.region, s.postalCode, s.country].filter(Boolean).join(", ") || "No address recorded";
}

const blankSite = {
  name: "", kind: "BRANCH", street: "", city: "", region: "",
  postalCode: "", country: "", phone: "", email: "", isPrimary: false, notes: "",
};

const blankContact = {
  name: "", title: "", phone: "", mobile: "", email: "",
  role: "OTHER", isPrimary: false, notifyDeliveryStatus: false, notifyInvoices: false, notes: "",
};

/**
 * Locations and named contacts for one trading partner.
 *
 * The same panel serves clients and vendors, because both sides share the two
 * tables behind it. Which permission applies is decided server-side from the
 * party type, so this component never has to know.
 */
export function PartyProfilePanel({ partyType, partyId }: { partyType: PartyType; partyId: string }) {
  const { toast } = useToast();
  const [sites, setSites] = useState<PartySite[]>([]);
  const [contacts, setContacts] = useState<PartyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // null = form closed; a draft = form open, with an id when editing.
  const [siteDraft, setSiteDraft] = useState<(typeof blankSite & { id?: string; version?: number }) | null>(null);
  const [contactDraft, setContactDraft] = useState<(typeof blankContact & { id?: string; version?: number }) | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        apiFetch<PartySite[]>(`/api/parties/${partyType}/${partyId}/sites`),
        apiFetch<PartyContact[]>(`/api/parties/${partyType}/${partyId}/contacts`),
      ]);
      setSites(s);
      setContacts(c);
    } catch {
      setSites([]);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [partyType, partyId]);

  useEffect(() => { void load(); }, [load]);

  async function save(kind: "sites" | "contacts", draft: Record<string, unknown>) {
    setBusy(true);
    try {
      const id = draft.id as string | undefined;
      await apiFetch(
        id ? `/api/parties/${kind}/${id}` : `/api/parties/${partyType}/${partyId}/${kind}`,
        { method: id ? "PATCH" : "POST", body: JSON.stringify(draft) },
      );
      toast({ title: id ? "Saved" : "Added", variant: "success" });
      if (kind === "sites") setSiteDraft(null); else setContactDraft(null);
      await load();
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof ApiError ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: "sites" | "contacts", id: string, label: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/parties/${kind}/${id}`, { method: "DELETE" });
      toast({ title: `Removed ${label}`, variant: "success" });
      await load();
    } catch (e) {
      toast({ title: "Could not remove", description: e instanceof ApiError ? e.message : "Failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground">Loading profile…</p>;

  return (
    <div className="space-y-6">
      {/* ── Locations ─────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Locations
            <span className="font-normal text-muted-foreground">({sites.length})</span>
          </h3>
          {siteDraft === null && (
            <Button size="sm" variant="outline" onClick={() => setSiteDraft({ ...blankSite })}>
              <Plus className="h-3.5 w-3.5" />Add location
            </Button>
          )}
        </div>

        <div className="rounded-md border">
          {sites.length === 0 ? (
            <p className="px-3 py-5 text-center text-sm text-muted-foreground">
              No locations yet. Add the registered address and any depots freight is delivered to.
            </p>
          ) : (
            <ul className="divide-y">
              {sites.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {s.name}
                      {s.isPrimary && <Badge variant="info">Registered</Badge>}
                      <span className="text-xs font-normal text-muted-foreground">
                        {SITE_KINDS.find(([v]) => v === s.kind)?.[1] ?? s.kind}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{addressLine(s)}</p>
                  </div>
                  <Button variant="ghost" size="icon" disabled={busy}
                    onClick={() => setSiteDraft({
                      id: s.id, version: s.version, name: s.name, kind: s.kind,
                      street: s.street ?? "", city: s.city ?? "", region: s.region ?? "",
                      postalCode: s.postalCode ?? "", country: s.country ?? "",
                      phone: s.phone ?? "", email: s.email ?? "", isPrimary: s.isPrimary, notes: s.notes ?? "",
                    })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={busy} onClick={() => remove("sites", s.id, s.name)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {siteDraft && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{siteDraft.id ? "Edit location" : "New location"}</p>
              <Button variant="ghost" size="icon" onClick={() => setSiteDraft(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Name</Label>
                <Input value={siteDraft.name} onChange={(e) => setSiteDraft({ ...siteDraft, name: e.target.value })} placeholder="Mwanza depot" />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={siteDraft.kind} onValueChange={(v) => setSiteDraft({ ...siteDraft, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SITE_KINDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label>Street</Label>
                <Input value={siteDraft.street} onChange={(e) => setSiteDraft({ ...siteDraft, street: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={siteDraft.city} onChange={(e) => setSiteDraft({ ...siteDraft, city: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Input value={siteDraft.region} onChange={(e) => setSiteDraft({ ...siteDraft, region: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input maxLength={2} placeholder="TZ" value={siteDraft.country}
                  onChange={(e) => setSiteDraft({ ...siteDraft, country: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={siteDraft.phone} onChange={(e) => setSiteDraft({ ...siteDraft, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Email</Label>
                <Input type="email" value={siteDraft.email} onChange={(e) => setSiteDraft({ ...siteDraft, email: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={siteDraft.isPrimary}
                onChange={(e) => setSiteDraft({ ...siteDraft, isPrimary: e.target.checked })} />
              This is the registered address
            </label>
            <Button size="sm" disabled={busy || !siteDraft.name.trim()} onClick={() => save("sites", siteDraft)}>
              {busy ? "Saving…" : "Save location"}
            </Button>
          </div>
        )}
      </section>

      {/* ── Contacts ──────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UserRound className="h-4 w-4 text-muted-foreground" />
            Contacts
            <span className="font-normal text-muted-foreground">({contacts.length})</span>
          </h3>
          {contactDraft === null && (
            <Button size="sm" variant="outline" onClick={() => setContactDraft({ ...blankContact })}>
              <Plus className="h-3.5 w-3.5" />Add contact
            </Button>
          )}
        </div>

        <div className="rounded-md border">
          {contacts.length === 0 ? (
            <p className="px-3 py-5 text-center text-sm text-muted-foreground">
              No contacts yet. Add whoever should receive delivery updates and invoices.
            </p>
          ) : (
            <ul className="divide-y">
              {contacts.map((k) => (
                <li key={k.id} className="flex items-start gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {k.name}
                      {k.isPrimary && <Badge variant="info">Primary</Badge>}
                      <span className="text-xs font-normal text-muted-foreground">
                        {CONTACT_ROLES.find(([v]) => v === k.role)?.[1] ?? k.role}
                        {k.title ? ` · ${k.title}` : ""}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[k.email, k.mobile ?? k.phone].filter(Boolean).join(" · ") || "No contact details"}
                    </p>
                    {(k.notifyDeliveryStatus || k.notifyInvoices) && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        Notified about {[
                          k.notifyDeliveryStatus && "delivery status",
                          k.notifyInvoices && "invoices",
                        ].filter(Boolean).join(" and ")}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" disabled={busy}
                    onClick={() => setContactDraft({
                      id: k.id, version: k.version, name: k.name, title: k.title ?? "",
                      phone: k.phone ?? "", mobile: k.mobile ?? "", email: k.email ?? "",
                      role: k.role, isPrimary: k.isPrimary,
                      notifyDeliveryStatus: k.notifyDeliveryStatus, notifyInvoices: k.notifyInvoices,
                      notes: k.notes ?? "",
                    })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={busy} onClick={() => remove("contacts", k.id, k.name)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {contactDraft && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{contactDraft.id ? "Edit contact" : "New contact"}</p>
              <Button variant="ghost" size="icon" onClick={() => setContactDraft(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={contactDraft.name} onChange={(e) => setContactDraft({ ...contactDraft, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Job title</Label>
                <Input value={contactDraft.title} onChange={(e) => setContactDraft({ ...contactDraft, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={contactDraft.role} onValueChange={(v) => setContactDraft({ ...contactDraft, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTACT_ROLES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={contactDraft.email} onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={contactDraft.phone} onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Mobile</Label>
                <Input value={contactDraft.mobile} onChange={(e) => setContactDraft({ ...contactDraft, mobile: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={contactDraft.isPrimary}
                  onChange={(e) => setContactDraft({ ...contactDraft, isPrimary: e.target.checked })} />
                Primary contact
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={contactDraft.notifyDeliveryStatus}
                  onChange={(e) => setContactDraft({ ...contactDraft, notifyDeliveryStatus: e.target.checked })} />
                Send delivery status updates
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={contactDraft.notifyInvoices}
                  onChange={(e) => setContactDraft({ ...contactDraft, notifyInvoices: e.target.checked })} />
                Send invoices here
              </label>
            </div>
            {/* An address is required before either box can mean anything. */}
            {(contactDraft.notifyDeliveryStatus || contactDraft.notifyInvoices) && !contactDraft.email && (
              <p className="text-xs text-warning">Add an email address, or nothing can be sent to this contact.</p>
            )}
            <Button size="sm" disabled={busy || !contactDraft.name.trim()} onClick={() => save("contacts", contactDraft)}>
              {busy ? "Saving…" : "Save contact"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
