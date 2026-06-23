import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ReceivablesManager } from "./receivables-manager";

export const metadata = { title: "Receivables | FleetFlow" };

export default async function ReceivablesPage() {
  const customers = await prisma.customer.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, currency: true },
    orderBy: { code: "asc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Accounts Receivable" subtitle="Customer invoices, posting to the ledger, and receipts." />
      <ReceivablesManager customers={customers} />
    </div>
  );
}
