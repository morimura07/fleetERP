import { PageHeader } from "@/components/layout/page-header";
import { DriversManager } from "./drivers-manager";

export const metadata = { title: "Drivers | FleetFlow" };

export default function DriversPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Drivers" subtitle="Driver roster, availability, and compliance." />
      <DriversManager />
    </div>
  );
}
