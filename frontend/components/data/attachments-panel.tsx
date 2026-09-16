"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Trash2, Upload, FileText } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { useToast } from "@frontend/components/ui/toast";
import { apiFetch, ApiError } from "@frontend/lib/fetcher";
import { ATTACHMENT_KIND_LABEL, type AttachmentKind } from "@frontend/lib/attachments";

export interface AttachmentRow {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  note: string | null;
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Documents held against one record.
 *
 * The same panel serves every attachable record, so a screen adds document
 * support by rendering it with an entityType and id rather than by growing its
 * own upload form. What a given user may do is decided by the API from the
 * owning record's module, not here.
 */
export function AttachmentsPanel({
  entityType,
  entityId,
  onCountChange,
}: {
  entityType: string;
  entityId: string;
  /** Lets a parent list update its evidence badge without refetching. */
  onCountChange?: (count: number) => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<AttachmentKind>("OTHER");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<AttachmentRow[]>(
        `/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      );
      setRows(list);
      onCountChange?.(list.length);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
    // onCountChange is intentionally excluded: a parent passing an inline arrow
    // would otherwise re-fetch on every one of its renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast({ title: "Choose a file first", variant: "destructive" });
      return;
    }
    const body = new FormData();
    body.append("file", file);
    body.append("entityType", entityType);
    body.append("entityId", entityId);
    body.append("kind", kind);
    if (note) body.append("note", note);

    setBusy(true);
    try {
      await apiFetch("/api/attachments", { method: "POST", body });
      toast({ title: "Document uploaded", variant: "success" });
      if (fileRef.current) fileRef.current.value = "";
      setNote("");
      await load();
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof ApiError ? e.message : "Could not upload the file",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, fileName: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/attachments/${id}`, { method: "DELETE" });
      toast({ title: `Removed ${fileName}`, variant: "success" });
      await load();
    } catch (e) {
      toast({
        title: "Could not remove",
        description: e instanceof ApiError ? e.message : "Failed",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        {loading ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading documents…</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No documents yet. Receipts, photos, surveyor reports and signed paperwork belong here.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {/* Opens in a new tab: these are evidence files someone is
                      cross-checking against the record still on screen. */}
                  <a
                    href={`${API_BASE}${r.fileUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {r.fileName}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    {ATTACHMENT_KIND_LABEL[r.kind]} · {fileSize(r.sizeBytes)} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(r.id, r.fileName)}
                  aria-label={`Remove ${r.fileName}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label className="text-xs text-muted-foreground">File</Label>
            <Input ref={fileRef} type="file" disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AttachmentKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ATTACHMENT_KIND_LABEL) as AttachmentKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{ATTACHMENT_KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Surveyor report" disabled={busy} />
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={upload} disabled={busy}>
            {busy ? <Upload className="h-4 w-4 animate-pulse" /> : <Paperclip className="h-4 w-4" />}
            {busy ? "Uploading…" : "Attach"}
          </Button>
        </div>
      </div>
    </div>
  );
}
