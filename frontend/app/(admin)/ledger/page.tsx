import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { LedgerManager } from "./ledger-manager";

export const metadata = { title: "Journal | FleetFlow" };

export default async function LedgerPage() {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal"
        subtitle="Double-entry journal entries — draft, post, and reverse."
      />
      <LedgerManager accounts={accounts} />
    </div>
  );
}
