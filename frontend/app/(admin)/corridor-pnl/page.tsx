import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { CorridorPnL, type CorridorPnLResponse } from "./corridor-pnl";

export const metadata = { title: "Corridor P&L | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function CorridorPnLPage() {
  const data = await serverApi<CorridorPnLResponse>("/api/dashboard/corridor-profitability");
  return (
    <div className="space-y-6">
      <PageHeader title="Corridor Profitability" subtitle="Revenue, cost and margin by route corridor — Northern, Central, and Domestic. Revenue is freight + demurrage; cost is the linked trip's wages, tolls and expenses." />
      <CorridorPnL data={data} />
    </div>
  );
}
