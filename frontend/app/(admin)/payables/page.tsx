import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { PayablesManager } from "./payables-manager";

export const metadata = { title: "Payables | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function PayablesPage() {
  const vendors = await serverApi<{ id: string; code: string; legalName: string; currency: string }[]>(
    "/api/lookups/vendors",
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Accounts Payable" subtitle="Vendor bills, posting to the ledger, and payments." />
      <PayablesManager vendors={vendors} />
    </div>
  );
}
