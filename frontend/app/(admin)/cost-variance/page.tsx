import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { CostVariance, type CostVarianceReport } from "./cost-variance";

export const metadata = { title: "Cost Variance | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function CostVariancePage() {
  const data = await serverApi<CostVarianceReport>("/api/inventory/cost-variance");
  return (
    <div className="space-y-6">
      <PageHeader title="Standard-Cost Variance" subtitle="Actual moving-average cost vs the standard cost benchmark for each stock item. A positive variance means the item is costing more than standard (unfavorable)." />
      <CostVariance data={data} />
    </div>
  );
}
