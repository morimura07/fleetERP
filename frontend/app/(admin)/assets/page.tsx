import { PageHeader } from "@frontend/components/layout/page-header";
import { AssetsManager } from "./assets-manager";

export const metadata = { title: "Fixed Assets | FleetFlow" };
export const dynamic = "force-dynamic";

export default function AssetsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Fixed Assets" subtitle="Asset register with straight-line depreciation and disposal, posted to the ledger." />
      <AssetsManager />
    </div>
  );
}
