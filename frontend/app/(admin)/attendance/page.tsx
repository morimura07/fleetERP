import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { AttendanceManager } from "./attendance-manager";

export const metadata = { title: "Time & Attendance | FleetFlow" };
export const dynamic = "force-dynamic";

type AttForm = { employees: { id: string; code: string; name: string }[] };

export default async function AttendancePage() {
  const { employees } = await serverApi<AttForm>("/api/lookups/attendance-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Time & Attendance" subtitle="Clock-in/out records rolled into monthly timesheets; approved overtime feeds payroll." />
      <AttendanceManager employees={employees} />
    </div>
  );
}
