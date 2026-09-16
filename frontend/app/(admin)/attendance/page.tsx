import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { AttendanceManager } from "./attendance-manager";
import type { Lookups } from "./shared";

export const metadata = { title: "Time Management | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const lookups = await serverApi<Lookups>("/api/lookups/attendance-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Time Management" subtitle="Shifts, tasks and hours of service; rostered against shift codes; rolled into timesheets that feed payroll." />
      <AttendanceManager lookups={lookups} />
    </div>
  );
}
