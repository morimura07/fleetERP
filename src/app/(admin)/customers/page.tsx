import { PageHeader } from "@/components/layout/page-header";
import { CustomersManager } from "./customers-manager";

export const metadata = { title: "Customers | FleetFlow" };

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="Billing customers with credit terms (Accounts Receivable)." />
      <CustomersManager />
    </div>
  );
}
