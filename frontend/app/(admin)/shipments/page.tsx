import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { ShipmentsManager } from "./shipments-manager";

export const metadata = { title: "Shipments | FleetFlow" };
export const dynamic = "force-dynamic";

type Form = { vendors: { id: string; code: string; legalName: string }[] };

export default async function ShipmentsPage() {
  const { vendors } = await serverApi<Form>("/api/lookups/procurement-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Shipments & Customs" subtitle="Consignments against purchase orders: the plan, the papers that gate the goods receipt, the clearing agent, duty, and where the container is." />
      <ShipmentsManager vendors={vendors} />
    </div>
  );
}
