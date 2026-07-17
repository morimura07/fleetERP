import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { PosManager } from "./pos-manager";

export const metadata = { title: "Retail POS | FleetFlow" };
export const dynamic = "force-dynamic";

type PosForm = {
  items: { id: string; code: string; name: string; unit: string; quantityOnHand: string; avgCost: string }[];
};

export default async function PosPage() {
  const { items } = await serverApi<PosForm>("/api/lookups/pos-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Retail POS" subtitle="Over-the-counter sales of parts and stock. Completing a sale relieves inventory and posts cash, revenue and cost of goods to the ledger." />
      <PosManager items={items} />
    </div>
  );
}
