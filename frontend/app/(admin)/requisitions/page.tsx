import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { RequisitionsManager } from "./requisitions-manager";
import type { ItemOpt } from "./shared";

export const metadata = { title: "Requisitions | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function RequisitionsPage() {
  const { items } = await serverApi<{ items: ItemOpt[] }>("/api/lookups/procurement-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Requisitions" subtitle="What departments need, checked against budget and approved through the delegation-of-authority matrix before anyone is asked to quote." />
      <RequisitionsManager items={items} />
    </div>
  );
}
