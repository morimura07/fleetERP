import { PageHeader } from "@/components/layout/page-header";
import { BudgetsManager } from "./budgets-manager";

export const metadata = { title: "Budgets | FleetFlow" };

export default function BudgetsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Budgets" subtitle="CapEx / OpEx budget control per cost center." />
      <BudgetsManager />
    </div>
  );
}
