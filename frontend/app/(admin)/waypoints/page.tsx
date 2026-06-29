import { PageHeader } from "@/components/layout/page-header";
import { WaypointsManager } from "./waypoints-manager";

export const metadata = { title: "GPS Waypoints | FleetFlow" };

export default function WaypointsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="GPS Waypoints" subtitle="Named corridor checkpoints, borders & weighbridges." />
      <WaypointsManager />
    </div>
  );
}
