import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { JobsManager } from "./jobs-manager";

export const metadata = { title: "Delivery Jobs | FleetFlow" };

export default async function JobsPage() {
  const clients = await prisma.client.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Delivery Jobs" subtitle="Domestic delivery assignments." />
      <JobsManager clients={clients} />
    </div>
  );
}
