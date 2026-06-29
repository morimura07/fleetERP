import { PageHeader } from "@frontend/components/layout/page-header";
import { ComplianceManager } from "./compliance-manager";

export const metadata = { title: "Compliance | FleetFlow" };

export default function CompliancePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Compliance & Fleet Health" subtitle="Document expiry across vehicles & drivers, and fuel-efficiency monitoring." />
      <ComplianceManager />
    </div>
  );
}
