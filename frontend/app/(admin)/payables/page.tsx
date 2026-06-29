import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { PayablesManager } from "./payables-manager";

export const metadata = { title: "Payables | FleetFlow" };

export default async function PayablesPage() {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    select: { id: true, code: true, legalName: true, currency: true },
    orderBy: { code: "asc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Accounts Payable" subtitle="Vendor bills, posting to the ledger, and payments." />
      <PayablesManager vendors={vendors} />
    </div>
  );
}
