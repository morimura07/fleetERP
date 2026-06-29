import { PageHeader } from "@/components/layout/page-header";
import { ConsolidationManager } from "./consolidation-manager";

export const metadata = { title: "Consolidation | FleetFlow" };

export default function ConsolidationPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Consolidation" subtitle="Roll subsidiary ledgers into the parent entity by rate type." />
      <ConsolidationManager />
    </div>
  );
}
