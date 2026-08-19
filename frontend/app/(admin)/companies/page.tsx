import { auth } from "@/auth";
import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { CompaniesManager, type OrganizationOption } from "./companies-manager";

export const metadata = { title: "Companies | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const session = await auth();
  const isPlatformAdmin = session?.user?.role === "SUPER_ADMIN";

  // Only the platform operator chooses which parent a company lands in. An
  // organization admin always creates inside their own, so they never see the
  // field and the list is not fetched for them.
  const organizations = isPlatformAdmin
    ? await serverApi<OrganizationOption[]>("/api/organizations")
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        subtitle={
          isPlatformAdmin
            ? "Legal entities across every organization. Each company's data is fully isolated, and a company always belongs to one parent organization."
            : "Legal entities inside your organization. Each company's data is fully isolated."
        }
      />
      <CompaniesManager isPlatformAdmin={isPlatformAdmin} organizations={organizations} />
    </div>
  );
}
