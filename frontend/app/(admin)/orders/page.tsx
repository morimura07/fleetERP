import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { OrdersManager } from "./orders-manager";

export const metadata = { title: "Orders | FleetFlow" };

export default async function OrdersPage() {
  const clients = await prisma.client.findMany({
    select: { id: true, companyName: true },
    orderBy: { companyName: "asc" },
  });
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
