import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { FeedbackManager } from "./feedback-manager";

export const metadata = { title: "Customer Feedback | FleetFlow" };
export const dynamic = "force-dynamic";

type KpiForm = {
  vehicles: { id: string; plateNumber: string; model: string }[];
  trips: { id: string; tripCode: string }[];
  orders: { id: string; orderCode: string }[];
  customers: { id: string; name: string }[];
};

export default async function FeedbackPage() {
  const { customers, orders } = await serverApi<KpiForm>("/api/lookups/kpi-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Customer Feedback" subtitle="CSAT (1–5) and NPS (0–10) scores captured per customer — the source for the CSAT and NPS dashboard KPIs." />
      <FeedbackManager customers={customers} orders={orders} />
    </div>
  );
}
