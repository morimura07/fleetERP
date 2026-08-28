import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { IncidentReportsManager } from "./damage-reports-manager";

// Renamed from "Damage Reports" at the client's suggestion: the screen covers
// loss, shortage, theft and insurance recovery, not only damage. The route stays
// /damage-reports so existing links and bookmarks keep working.
export const metadata = { title: "Incident Reports | FleetFlow" };
export const dynamic = "force-dynamic";

type KpiForm = {
  vehicles: { id: string; plateNumber: string; model: string; vehicleNumber: string }[];
  trips: { id: string; tripCode: string }[];
  orders: { id: string; orderCode: string }[];
  drivers: { id: string; name: string }[];
  clients: { id: string; companyName: string }[];
};

export default async function IncidentReportsPage() {
  const { orders, trips, vehicles, drivers, clients } = await serverApi<KpiForm>("/api/lookups/kpi-form");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Incident Reports"
        subtitle="Loss, damage and claims (OS&D). Logged against cargo value to drive the Damage & Claim Rate KPI, and tracked through to insurance recovery."
      />
      <IncidentReportsManager
        orders={orders}
        trips={trips}
        vehicles={vehicles}
        drivers={drivers}
        clients={clients}
      />
    </div>
  );
}
