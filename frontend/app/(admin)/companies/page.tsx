import { PageHeader } from "@frontend/components/layout/page-header";
import { CompaniesManager } from "./companies-manager";

export const metadata = { title: "Companies | FleetFlow" };
export const dynamic = "force-dynamic";

export default function CompaniesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Companies" subtitle="Legal entities (tenants). Each company's data is fully isolated." />
      <CompaniesManager />
    </div>
  );
}
