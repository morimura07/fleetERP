import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { RfqsManager } from "./rfqs-manager";
import type { ItemOpt } from "./shared";

export const metadata = { title: "RFQs | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function RfqsPage() {
  const { items } = await serverApi<{ items: ItemOpt[] }>("/api/lookups/procurement-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Requests for Quotation" subtitle="Ask approved vendors to quote, compare the bids side by side, record what was negotiated, and award through the approval matrix." />
      <RfqsManager items={items} />
    </div>
  );
}
