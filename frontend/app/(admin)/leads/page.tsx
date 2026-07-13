import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { LeadsManager } from "./leads-manager";

export const metadata = { title: "Leads | FleetFlow" };
export const dynamic = "force-dynamic";

type SalesForm = {
  clients: { id: string; companyName: string }[];
  leads: { id: string; companyName: string }[];
  salespeople: { id: string; name: string }[];
};

export default async function LeadsPage() {
  const { salespeople } = await serverApi<SalesForm>("/api/lookups/sales-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Leads" subtitle="Sales pipeline — prospective clients from first contact through to a won deal or a quotation." />
      <LeadsManager salespeople={salespeople} />
    </div>
  );
}
