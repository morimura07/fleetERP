import { PageHeader } from "@frontend/components/layout/page-header";
import { VendorsManager } from "./vendors-manager";

export const metadata = { title: "Vendors | FleetFlow" };

export default function VendorsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Vendors" subtitle="Suppliers, carriers, and clearing agents (Accounts Payable)." />
      <VendorsManager />
    </div>
  );
}
