"use client";
import { useState, type ComponentProps } from "react";
import { Download } from "lucide-react";
import { Button } from "@frontend/components/ui/button";
import { useToast } from "@frontend/components/ui/toast";
import { describeError } from "@frontend/lib/fetcher";
import { downloadFile } from "@frontend/lib/download";

/**
 * A button that downloads one file from the API with the session token.
 * Use it wherever a `<a href="/api/exports/...">` used to be: a link cannot
 * authenticate, this can.
 */
export function DownloadButton({
  path,
  fileName,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "asChild"> & {
  /** API path, e.g. "/api/exports/dispatch-pdf?date=2026-09-16". */
  path: string;
  /** Used only if the server sends no Content-Disposition. */
  fileName?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await downloadFile(path, fileName);
    } catch (e) {
      toast({ title: "Download failed", description: describeError(e, "Could not build the file"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button {...props} disabled={busy || props.disabled} onClick={run}>
      <Download className={`h-4 w-4${busy ? " animate-pulse" : ""}`} />
      {children}
    </Button>
  );
}
