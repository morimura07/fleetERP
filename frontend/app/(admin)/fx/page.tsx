import { PageHeader } from "@frontend/components/layout/page-header";
import { FxManager } from "./fx-manager";

export const metadata = { title: "Exchange Rates | FleetFlow" };

export default function FxPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Exchange Rates" subtitle="Multi-currency rates by type — Spot, Average, Historical." />
      <FxManager />
    </div>
  );
}
