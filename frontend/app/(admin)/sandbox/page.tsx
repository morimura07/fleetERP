import { serverApi } from "@frontend/lib/server-api";
import { PageHeader } from "@frontend/components/layout/page-header";
import { SandboxManager, type SandboxStatus } from "./sandbox-manager";

export const metadata = { title: "Sandbox | FleetFlow" };
export const dynamic = "force-dynamic";

export default async function SandboxPage() {
  const partitions = await serverApi<SandboxStatus[]>("/api/sandbox");
  return (
    <div className="space-y-6">
      <PageHeader title="Demo Sandbox" subtitle="An isolated partition for training and demos. Data lives under its own company code and never touches real entities — you can reset it to a clean demo baseline at any time." />
      <SandboxManager initial={partitions} />
    </div>
  );
}
