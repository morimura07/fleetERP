"use client";
import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@frontend/components/ui/dropdown-menu";
import { useToast } from "@frontend/components/ui/toast";
import { getToken } from "@frontend/lib/auth-token";
import { getActiveCompany } from "@frontend/lib/fetcher";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

const FORMATS = [
  { value: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet },
  { value: "csv", label: "CSV", icon: Table2 },
  { value: "pdf", label: "PDF", icon: FileText },
] as const;

/**
 * Downloads the current list as a file.
 *
 * It hits the same endpoint the table is showing, with the same filters, so the
 * file always matches what is on screen. `apiFetch` is not used because that
 * unwraps JSON; a download needs the raw body, and the bearer token has to be
 * attached by hand because a plain link cannot carry a header.
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

      const res = await fetch(`${API_BASE}${endpoint}?${params}`, {
        headers: {
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          ...(getActiveCompany() ? { "X-Data-Area": getActiveCompany() as string } : {}),
        },
      });

      if (!res.ok) {
        // The server explains a refusal (too many rows, unknown format) in JSON.
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `Export failed (${res.status})`);
      }

      // Filename comes from Content-Disposition so the server names the file.
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const named = /filename="?([^"]+)"?/.exec(disposition)?.[1];

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named ?? `export.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not build the file",
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
