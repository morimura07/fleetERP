import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { JobsManager } from "./jobs-manager";

export const metadata = { title: "Delivery Jobs | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const clients = await serverApi<{ id: string; companyName: string }[]>("/api/lookups/clients");
  return (
    <div className="space-y-6">
      <PageHeader title="Delivery Jobs" subtitle="Domestic delivery assignments." />
      <JobsManager clients={clients} />
    </div>
  );
}
