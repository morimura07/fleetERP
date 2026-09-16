import { PageHeader } from "@frontend/components/layout/page-header";
import { PlanningManager } from "./planning-manager";
import { CapacityPanel } from "./capacity-panel";

export const metadata = { title: "Master Planning | FleetFlow" };
export const dynamic = "force-dynamic";

export default function PlanningPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Master Planning" subtitle="Demand forecasts per corridor and period, compared against live fleet capacity to surface shortfalls before they bite." />
      <CapacityPanel />
      <PlanningManager />
    </div>
  );
}
