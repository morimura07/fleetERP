import { PageHeader } from "@frontend/components/layout/page-header";
import { PayrollManager } from "./payroll-manager";

export const metadata = { title: "Payroll | FleetFlow" };
export const dynamic = "force-dynamic";

export default function PayrollPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" subtitle="Employees, monthly pay runs, and statutory deductions (PAYE / NSSF / SHIF)." />
      <PayrollManager />
    </div>
  );
}
