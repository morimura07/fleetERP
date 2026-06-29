import { PageHeader } from "@/components/layout/page-header";
import { ClientsManager } from "./clients-manager";

export const metadata = { title: "Clients | FleetFlow" };

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Clients" subtitle="Shippers and freight customers." />
      <ClientsManager />
    </div>
  );
}
