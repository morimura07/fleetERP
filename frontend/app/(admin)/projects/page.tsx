import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { ProjectsManager } from "./projects-manager";

export const metadata = { title: "Projects | FleetFlow" };
export const dynamic = "force-dynamic";

type ProjectForm = {
  clients: { id: string; companyName: string }[];
  orders: { id: string; orderCode: string; projectId: string | null }[];
};

export default async function ProjectsPage() {
  const { clients, orders } = await serverApi<ProjectForm>("/api/lookups/project-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Projects" subtitle="Contracts and campaigns grouping freight orders, tracked against a planned budget with live budget-vs-actual P&L." />
      <ProjectsManager clients={clients} orders={orders} />
    </div>
  );
}
