import { PageHeader } from "@frontend/components/layout/page-header";
import { AccountsManager } from "./accounts-manager";

export const metadata = { title: "Chart of Accounts | FleetFlow" };

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts"
        subtitle="Your general-ledger account structure."
      />
      <AccountsManager />
    </div>
  );
}
