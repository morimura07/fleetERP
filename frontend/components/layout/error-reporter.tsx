"use client";
import { useEffect } from "react";
import { useToast } from "@frontend/components/ui/toast";
import { ApiError, describeError } from "@frontend/lib/fetcher";

/**
 * The last line of defence for a failed call nobody caught.
 *
 * Most screens catch their own errors and show a toast. The ones that do not
 * (a lookup fetched in an effect, a detail loaded on open) used to fail into
 * the browser console only, so the person saw a form that never filled in
 * and no explanation. This turns any unhandled rejection into the same toast
 * the careful screens show. A 401 is left alone: apiFetch has already sent
 * the person to sign in again.
 */
export function ErrorReporter() {
  const { toast } = useToast();
  useEffect(() => {
    const onRejection = (ev: PromiseRejectionEvent) => {
      const e = ev.reason;
      if (e instanceof ApiError && e.status === 401) { ev.preventDefault(); return; }
      console.error("Unhandled error:", e);
      toast({ title: "Something went wrong", description: describeError(e), variant: "destructive" });
      ev.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, [toast]);
  return null;
}
