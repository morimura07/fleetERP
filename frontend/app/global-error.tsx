"use client";

/**
 * Root-level error boundary. `app/error.tsx` cannot catch a failure in the root
 * layout itself (e.g. a provider or `auth()` throwing during SSR) — this can.
 * It replaces the whole document, so it ships its own <html>/<body> and uses
 * inline styles rather than app CSS, which may be exactly what failed to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#f6f8f7",
          color: "#16211c",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "34rem",
            width: "100%",
            background: "#fff",
            border: "1px solid #dfe6e2",
            borderRadius: 12,
            padding: "1.5rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
            The application failed to start
          </h1>
          <p style={{ marginTop: ".35rem", fontSize: ".875rem", color: "#5c6b64" }}>
            A server-side error occurred before the page could render. This is normally a missing
            environment variable or an unreachable API on a fresh deployment.
          </p>

          {error.digest && (
            <p style={{ marginTop: ".9rem", fontSize: ".78rem", color: "#5c6b64" }}>
              Error ID: <code style={{ fontFamily: "ui-monospace, monospace" }}>{error.digest}</code>{" "}
              — search the server logs for this value to see the stack trace.
            </p>
          )}

          <div style={{ marginTop: "1.1rem", fontSize: ".78rem", color: "#5c6b64" }}>
            <p style={{ fontWeight: 600, color: "#16211c", margin: "0 0 .4rem" }}>Check first</p>
            <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.7 }}>
              <li>
                <code style={{ fontFamily: "ui-monospace, monospace" }}>AUTH_SECRET</code> is set
              </li>
              <li>
                <code style={{ fontFamily: "ui-monospace, monospace" }}>AUTH_URL</code> matches this
                site&apos;s public origin
              </li>
              <li>
                <code style={{ fontFamily: "ui-monospace, monospace" }}>API_URL</code> points to a
                running backend
              </li>
            </ul>
          </div>

          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              background: "#0f9d78",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: ".5rem .85rem",
              fontSize: ".875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
