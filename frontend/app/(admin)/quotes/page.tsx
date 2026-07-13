import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { QuotesManager } from "./quotes-manager";

export const metadata = { title: "Quotes | FleetFlow" };
export const dynamic = "force-dynamic";

type SalesForm = {
  clients: { id: string; companyName: string }[];
  leads: { id: string; companyName: string }[];
  salespeople: { id: string; name: string }[];
};

export default async function QuotesPage() {
  const { clients } = await serverApi<SalesForm>("/api/lookups/sales-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Quotes" subtitle="Freight quotations with priced line items. An accepted quote converts into a freight order in one click." />
      <QuotesManager clients={clients} />
    </div>
  );
}
