import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { WarehousesManager } from "./warehouses-manager";

export const metadata = { title: "Warehouses | FleetFlow" };
export const dynamic = "force-dynamic";

type WarehouseForm = {
  items: { id: string; code: string; name: string; unit: string }[];
  warehouses: { id: string; code: string; name: string }[];
};

export default async function WarehousesPage() {
  const { items, warehouses } = await serverApi<WarehouseForm>("/api/lookups/warehouse-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Warehouses" subtitle="Storage locations, per-location stock balances, and inter-warehouse transfers." />
      <WarehousesManager items={items} warehouses={warehouses} />
    </div>
  );
}
