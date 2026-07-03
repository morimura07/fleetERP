import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { ExpensesManager } from "./expenses-manager";

export const metadata = { title: "Expenses | FleetFlow" };
export const dynamic = "force-dynamic";

type ExpenseForm = {
  drivers: { id: string; name: string }[];
  advances: { id: string; reference: string; amount: string; type: string; driver: { name: string } | null }[];
};

export default async function ExpensesPage() {
  const { drivers, advances } = await serverApi<ExpenseForm>("/api/lookups/expense-form");
  return (
    <div className="space-y-6">
      <PageHeader title="Expenses" subtitle="Trip cash-sheets and expense claims with receipts, reconciled against driver advances." />
      <ExpensesManager drivers={drivers} advances={advances} />
    </div>
  );
}
