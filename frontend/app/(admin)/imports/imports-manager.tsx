"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Upload } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { Label } from "@frontend/components/ui/label";
import { Badge } from "@frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@frontend/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@frontend/components/ui/table";
import { useToast } from "@frontend/components/ui/toast";
import { getToken } from "@frontend/lib/auth-token";
import { apiFetch, ApiError, getActiveCompany } from "@frontend/lib/fetcher";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

interface Field { key: string; label: string; required: boolean }
interface Resource { name: string; title: string; rowCap: number; fields: Field[] }
interface RowError { row: number; field?: string; message: string }
interface Preview {
  resource: string;
  title: string;
  totalRows: number;
  willImport: number;
  mapping: Record<string, string>;
  unmappedHeaders: string[];
  missingRequired: string[];
  errors: RowError[];
  errorCount: number;
  sample: Record<string, unknown>[];
}

/**
 * Migration from another system: check the file, then apply it.
 *
 * The file is sent for both steps rather than held on the server between them,
 * so what gets written is always what was just checked. Nothing is written
 * until Import is pressed, and then it is all or nothing.
 */
export function ImportsManager() {
  const { toast } = useToast();
  const [resources, setResources] = useState<Resource[]>([]);
  const [resource, setResource] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<Resource[]>("/api/imports")
      .then((r) => {
        setResources(r);
        setResource((cur) => cur || r[0]?.name || "");
      })
      .catch(() => setResources([]));
  }, []);

  const spec = resources.find((r) => r.name === resource);

  /** Both steps post the same multipart body; only the path differs. */
  async function send(step: "preview" | "commit"): Promise<unknown> {
    const file = fileRef.current?.files?.[0];
    if (!file) throw new ApiError("Choose a file first", 400);
    const body = new FormData();
    body.append("file", file);
    if (step === "commit" && preview) body.append("mapping", JSON.stringify(preview.mapping));

    const res = await fetch(`${API_BASE}/api/imports/${resource}/${step}`, {
      method: "POST",
      body,
      headers: {
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(getActiveCompany() ? { "X-Data-Area": getActiveCompany() as string } : {}),
      },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(payload?.error ?? `Failed (${res.status})`, res.status);
    return payload?.data;
  }

  async function check() {
    setBusy(true);
    setPreview(null);
    try {
      setFileName(fileRef.current?.files?.[0]?.name ?? "");
      setPreview((await send("preview")) as Preview);
    } catch (e) {
      toast({
        title: "Could not read that file",
        description: e instanceof ApiError ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    try {
      const result = (await send("commit")) as { imported: number };
      toast({ title: `Imported ${result.imported} ${spec?.title.toLowerCase() ?? "records"}`, variant: "success" });
      setPreview(null);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast({
        title: "Nothing was imported",
        description: e instanceof ApiError ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const ready = preview !== null && preview.errorCount === 0 && preview.willImport > 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle className="text-base">1. Choose what to import</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label>Records</Label>
            <Select value={resource} onValueChange={(v) => { setResource(v); setPreview(null); }}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {resources.map((r) => <SelectItem key={r.name} value={r.name}>{r.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Spreadsheet (.xlsx or .csv)</Label>
            <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={() => setPreview(null)} />
          </div>
          <Button onClick={check} disabled={busy || !resource}>
            <FileUp className="h-4 w-4" />
            {busy && !preview ? "Checking…" : "Check file"}
          </Button>
        </CardContent>
      </Card>

      {spec && (
        <Card>
          <CardHeader><CardTitle className="text-base">Columns {spec.title.toLowerCase()} expect</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Your headings do not have to match these. Common alternatives are recognised
              automatically, and the match is shown back to you before anything is written.
              Up to {spec.rowCap.toLocaleString()} rows per file.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {spec.fields.map((f) => (
                <Badge key={f.key} variant={f.required ? "default" : "secondary"}>
                  {f.label}{f.required ? " *" : ""}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {preview.errorCount === 0
                ? <CheckCircle2 className="h-4 w-4 text-success" />
                : <AlertTriangle className="h-4 w-4 text-destructive" />}
              2. {fileName || "File"} — {preview.totalRows} row{preview.totalRows === 1 ? "" : "s"} read
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>Ready to import: <b className="tabular-nums">{preview.willImport}</b></span>
              <span className={preview.errorCount ? "text-destructive" : undefined}>
                Problems: <b className="tabular-nums">{preview.errorCount}</b>
              </span>
            </div>

            {preview.missingRequired.length > 0 && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                No column matched these required fields: {preview.missingRequired.join(", ")}.
                Rename the headings in your file, or add the columns.
              </p>
            )}

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                How your columns were matched
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(preview.mapping).map(([field, header]) => (
                  <Badge key={field} variant="secondary" className="font-normal">
                    {header} → {spec?.fields.find((f) => f.key === field)?.label ?? field}
                  </Badge>
                ))}
              </div>
              {preview.unmappedHeaders.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Ignored, because nothing here uses them: {preview.unmappedHeaders.join(", ")}
                </p>
              )}
            </div>

            {preview.errors.length > 0 && (
              <div className="max-h-72 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row</TableHead>
                      <TableHead className="w-40">Column</TableHead>
                      <TableHead>Problem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.errors.map((e, i) => (
                      <TableRow key={`${e.row}-${e.field}-${i}`}>
                        <TableCell className="tabular-nums">{e.row}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {spec?.fields.find((f) => f.key === e.field)?.label ?? e.field ?? "—"}
                        </TableCell>
                        <TableCell>{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {preview.errorCount > preview.errors.length && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    and {preview.errorCount - preview.errors.length} more. Fix these first; the rest
                    are often the same mistake repeated.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 border-t pt-4">
              <Button onClick={commit} disabled={!ready || busy}>
                <Upload className="h-4 w-4" />
                {busy ? "Importing…" : `Import ${preview.willImport} record${preview.willImport === 1 ? "" : "s"}`}
              </Button>
              <p className="text-xs text-muted-foreground">
                {ready
                  ? "All or nothing: if any row fails, none are written."
                  : "Fix the problems above, then check the file again."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
