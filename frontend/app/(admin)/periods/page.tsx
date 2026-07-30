import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { PeriodsManager, type PeriodView } from "./periods-manager";

export const metadata = { title: "Accounting Periods | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function PeriodsPage() {
  const periods = await serverApi<PeriodView[]>("/api/fiscal-periods");
  return (
    <div className="space-y-6">
      <PageHeader title="Accounting Periods" subtitle="Close a month to lock it — once closed, the ledger refuses any new posting dated in that period, preventing back-dated edits to signed-off months." />
      <PeriodsManager initial={periods} />
    </div>
  );
}
