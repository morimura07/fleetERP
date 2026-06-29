import Link from "next/link";
import { Button } from "@frontend/components/ui/button";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-5xl font-bold">403</h1>
      <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
      <Button asChild><Link href="/dashboard">Back to Dashboard</Link></Button>
    </div>
  );
}
