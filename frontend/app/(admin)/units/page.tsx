import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { UnitsManager, type Unit } from "./units-manager";

export const metadata = { title: "Units of Measure | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const units = await serverApi<Unit[]>("/api/units");
  return (
    <div className="space-y-6">
      <PageHeader title="Units of Measure" subtitle="Define the units the business trades in — weight, volume, distance, count. Each unit records how many base units it equals, so quantities convert automatically between any two units of the same dimension." />
      <UnitsManager initial={units} />
    </div>
  );
}
