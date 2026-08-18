import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { OrganizationsManager, type Organization } from "./organizations-manager";

export const metadata = { title: "Organizations | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const organizations = await serverApi<Organization[]>("/api/organizations");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        subtitle="The top level of the system. Each organization is a separate customer holding its own companies, its own users and its own data. One organization can never see another."
      />
      <OrganizationsManager initial={organizations} />
    </div>
  );
}
