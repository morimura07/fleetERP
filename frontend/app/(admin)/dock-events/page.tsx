import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { DockEventsManager } from "./dock-events-manager";

export const metadata = { title: "Dock Events | FleetFlow" };
export const dynamic = "force-dynamic";

type KpiForm = {
  vehicles: { id: string; plateNumber: string; model: string; vehicleNumber: string }[];
  trips: { id: string; tripCode: string }[];
  drivers: { id: string; name: string }[];
  orders: { id: string; orderCode: string }[];
  customers: { id: string; name: string }[];
};

export default async function DockEventsPage() {
  const { vehicles, trips, drivers } = await serverApi<KpiForm>("/api/lookups/kpi-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Dock Events" subtitle="Arrival and departure timestamps at yards and facilities — the source data behind the Truck Turnaround KPI." />
      <DockEventsManager vehicles={vehicles} trips={trips} drivers={drivers} />
    </div>
  );
}
