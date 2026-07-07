import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { HrManager } from "./hr-manager";

export const metadata = { title: "Human Resources | FleetFlow" };
export const dynamic = "force-dynamic";

type HrForm = { employees: { id: string; code: string; name: string }[] };

export default async function HrPage() {
  const { employees } = await serverApi<HrForm>("/api/lookups/hr-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Human Resources" subtitle="Employment contracts, leave management, and document tracking." />
      <HrManager employees={employees} />
    </div>
  );
}
