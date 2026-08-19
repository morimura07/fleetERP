import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { VehiclesManager, type DriverOption } from "./vehicles-manager";

export const metadata = { title: "Vehicles | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  const { drivers } = await serverApi<{ drivers: DriverOption[] }>("/api/lookups/vehicle-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Vehicles" subtitle="Fleet registry, insurance, and inspections." />
      <VehiclesManager drivers={drivers} />
    </div>
  );
}
