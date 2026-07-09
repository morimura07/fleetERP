import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { ServiceManager } from "./service-manager";

export const metadata = { title: "Service Orders | FleetFlow" };
export const dynamic = "force-dynamic";

type ServiceForm = {
  vehicles: { id: string; plateNumber: string; model: string }[];
  vendors: { id: string; code: string; legalName: string }[];
  parts: { id: string; code: string; name: string; unit: string; quantityOnHand: string; avgCost: string }[];
};

export default async function ServicePage() {
  const { vehicles, vendors, parts } = await serverApi<ServiceForm>("/api/lookups/service-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Service Orders" subtitle="Workshop service orders for the fleet — parts drawn from inventory, labor tracked, costs posted to the ledger." />
      <ServiceManager vehicles={vehicles} vendors={vendors} parts={parts} />
    </div>
  );
}
