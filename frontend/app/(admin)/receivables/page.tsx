import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { ReceivablesManager } from "./receivables-manager";

export const metadata = { title: "Receivables | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function ReceivablesPage() {
  const customers = await serverApi<{ id: string; code: string; name: string; currency: string }[]>(
    "/api/lookups/customers",
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Accounts Receivable" subtitle="Customer invoices, posting to the ledger, and receipts." />
      <ReceivablesManager customers={customers} />
    </div>
  );
}
