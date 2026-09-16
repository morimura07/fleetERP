"use client";
import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@frontend/components/ui/dropdown-menu";
import { useToast } from "@frontend/components/ui/toast";
import { describeError } from "@frontend/lib/fetcher";
import { downloadFile } from "@frontend/lib/download";

const FORMATS = [
  { value: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet },
  { value: "csv", label: "CSV", icon: Table2 },
  { value: "pdf", label: "PDF", icon: FileText },
] as const;

/**
 * Downloads the current list as a file.
 *
 * It hits the same endpoint the table is showing, with the same filters, so the
 * file always matches what is on screen. The fetch itself is `downloadFile`,
 * which carries the bearer token a plain link cannot.
 */
export function ExportMenu({
  endpoint,
  filters,
  search,
  label = "Export",
}: {
  /** The list endpoint, e.g. "/api/operational-kpi/dock-events". */
  endpoint: string;
  filters?: Record<string, string>;
  /** The table's current search term, so the file matches the visible rows. */
  search?: string;
  label?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function download(format: string) {
    setBusy(true);
    try {
      const params = new URLSearchParams({ format });
      if (search) params.set("q", search);
      for (const [k, v] of Object.entries(filters ?? {})) if (v) params.set(k, v);

      await downloadFile(`${endpoint}?${params}`, `export.${format}`);
    } catch (e) {
      toast({
        title: "Export failed",
        description: describeError(e, "Could not build the file"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy}>
          <Download className={`h-4 w-4${busy ? " animate-pulse" : ""}`} />
          {busy ? "Preparing…" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Download these rows</DropdownMenuLabel>
        {FORMATS.map((f) => (
          <DropdownMenuItem key={f.value} onClick={() => download(f.value)}>
            <f.icon className="mr-2 h-4 w-4" />
            {f.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
