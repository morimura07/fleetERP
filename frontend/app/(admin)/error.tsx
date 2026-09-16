"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@frontend/components/ui/button";

/**
 * Error boundary for the signed-in screens. Keeps the sidebar and header in
 * place and explains the failure in plain words; the root boundary is the
 * fallback for when the layout itself cannot render.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Screen error:", error); }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
        <h2 className="mt-3 text-lg font-semibold">This screen could not be shown</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Something went wrong while loading it. Your data is safe. Try again, or go back to the dashboard.
        </p>
        {error.digest && <p className="mt-3 text-xs text-muted-foreground">Reference: <code className="font-mono">{error.digest}</code></p>}
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.assign("/dashboard")}>Dashboard</Button>
        </div>
      </div>
    </div>
  );
}
