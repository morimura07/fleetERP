import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { DamageReportsManager } from "./damage-reports-manager";

export const metadata = { title: "Damage Reports | FleetFlow" };
export const dynamic = "force-dynamic";

type KpiForm = {
  vehicles: { id: string; plateNumber: string; model: string }[];
  trips: { id: string; tripCode: string }[];
  orders: { id: string; orderCode: string }[];
  customers: { id: string; name: string }[];
};

export default async function DamageReportsPage() {
  const { orders, trips } = await serverApi<KpiForm>("/api/lookups/kpi-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Damage Reports" subtitle="Cargo damage and claims — value logged against cargo value to drive the Damage & Claim Rate KPI." />
      <DamageReportsManager orders={orders} trips={trips} />
    </div>
  );
}
