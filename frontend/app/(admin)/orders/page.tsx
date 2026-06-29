import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { OrdersManager } from "./orders-manager";

export const metadata = { title: "Orders | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const clients = await serverApi<{ id: string; companyName: string }[]>("/api/lookups/clients");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        subtitle="Cross-border freight bookings and their invoicing."
      />
      <OrdersManager clients={clients} />
    </div>
  );
}
