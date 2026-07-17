import { PageHeader } from "@frontend/components/layout/page-header";
import { RolesManager } from "./roles-manager";

export const metadata = { title: "Roles & Permissions | FleetFlow" };
export const dynamic = "force-dynamic";

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Roles & Permissions" subtitle="Create roles, grant permissions, and control exactly what each role can do. Built-in roles can be re-permissioned; custom roles can be created and assigned to users." />
      <RolesManager />
    </div>
  );
}
