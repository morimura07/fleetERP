"use client";

import { useEffect } from "react";

/**
 * App-level error boundary. Without this, an unhandled server-component error
 * renders Next's bare "a server-side exception has occurred" page with only a
 * digest — undiagnosable without shell access to the server logs. This shows
 * the digest prominently (so it can be matched against the logs) plus the most
 * common causes for this app, which is almost always API connectivity or a
 * missing environment variable on a fresh deploy.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the full error in the browser console for local debugging; the
    // server log holds the stack trace for this digest in production.
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The page could not be loaded. This is usually a configuration or connectivity problem
          rather than a bug in the screen you requested.
        </p>

        {/* In development the message is safe to show; in production Next strips
            it to avoid leaking internals, leaving only the digest. */}
        {error.message && (
          <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-3 text-xs text-foreground">
            {error.message}
          </pre>
        )}

        {error.digest && (
          <p className="mt-3 text-xs text-muted-foreground">
            Error ID: <code className="font-mono">{error.digest}</code> — search the server logs for
            this value to find the stack trace.
          </p>
        )}

        <div className="mt-5 space-y-1.5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Common causes</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>The API server is not running, or <code className="font-mono">API_URL</code> does not point to it</li>
            <li>
              <code className="font-mono">AUTH_SECRET</code> or <code className="font-mono">AUTH_URL</code> is unset
              (<code className="font-mono">AUTH_URL</code> must match this site&apos;s public origin)
            </li>
            <li>Database migrations have not been applied to this environment</li>
          </ul>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={reset}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a
            href="/login"
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground"
          >
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
