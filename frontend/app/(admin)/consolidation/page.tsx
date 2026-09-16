import { PageHeader } from "@frontend/components/layout/page-header";
import { ConsolidationManager } from "./consolidation-manager";

export const metadata = { title: "Consolidation | FleetFlow" };

export default function ConsolidationPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Consolidation" subtitle="Subsidiary ledgers translated to the group currency under IAS 21: closing, average and historical rates by account, intercompany elimination, ownership share, and the translation adjustment in equity." />
      <ConsolidationManager />
    </div>
  );
}
