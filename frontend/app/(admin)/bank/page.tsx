import { PageHeader } from "@/components/layout/page-header";
import { BankManager } from "./bank-manager";

export const metadata = { title: "Cash & Bank | FleetFlow" };

export default function BankPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Cash & Bank" subtitle="Bank, mobile-money & cash accounts, and driver disbursements." />
      <BankManager />
    </div>
  );
}
