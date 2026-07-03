import { PageHeader } from "@frontend/components/layout/page-header";
import { InventoryManager } from "./inventory-manager";

export const metadata = { title: "Inventory | FleetFlow" };
export const dynamic = "force-dynamic";

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" subtitle="Spare parts, fuel & consumables — stock levels and moving-average valuation." />
      <InventoryManager />
    </div>
  );
}
