import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">There is nothing at this address. It may have moved, or the link may be out of date.</p>
        <Link href="/dashboard" className="mt-5 inline-block rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Go to the dashboard</Link>
      </div>
    </div>
  );
}
