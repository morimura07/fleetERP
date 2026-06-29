import { PageHeader } from "@frontend/components/layout/page-header";
import { VehiclesManager } from "./vehicles-manager";

export const metadata = { title: "Vehicles | FleetFlow" };

export default function VehiclesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Vehicles" subtitle="Fleet registry, insurance, and inspections." />
      <VehiclesManager />
    </div>
  );
}
