import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { LedgerManager } from "./ledger-manager";

export const metadata = { title: "Journal | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const accounts = await serverApi<{ id: string; code: string; name: string }[]>("/api/lookups/accounts");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal"
        subtitle="Double-entry journal entries — draft, post, and reverse."
      />
      <LedgerManager accounts={accounts} />
    </div>
  );
}
