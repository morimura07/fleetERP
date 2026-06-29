import { serverApi } from "@frontend/lib/server-api";
import type { CorridorType } from "@frontend/lib/enums";
import { PageHeader } from "@frontend/components/layout/page-header";
import { TripsManager } from "./trips-manager";

export const metadata = { title: "Trips | FleetFlow" };
export const dynamic = "force-dynamic";

type TripForm = {
  orders: { id: string; orderCode: string; originZone: string; destinationZone: string; corridor: CorridorType }[];
  drivers: { id: string; name: string }[];
  vehicles: { id: string; vehicleNumber: string; plateNumber: string }[];
};

export default async function TripsPage() {
  const { orders, drivers, vehicles } = await serverApi<TripForm>("/api/lookups/trip-form");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Trips"
        subtitle="Trip execution, expenses, and per-trip profit & loss."
      />
      <TripsManager orders={orders} drivers={drivers} vehicles={vehicles} />
    </div>
  );
}
