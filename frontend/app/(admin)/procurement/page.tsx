import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { ProcurementManager } from "./procurement-manager";

export const metadata = { title: "Procurement | FleetFlow" };
export const dynamic = "force-dynamic";

type ProcurementForm = {
  vendors: { id: string; code: string; legalName: string; currency: string }[];
  items: { id: string; code: string; name: string; unit: string; expenseCode: string }[];
};

export default async function ProcurementPage() {
  const { vendors, items } = await serverApi<ProcurementForm>("/api/lookups/procurement-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Procurement" subtitle="Purchase orders, goods receipt, and 3-way matching." />
      <ProcurementManager vendors={vendors} items={items} />
    </div>
  );
}
