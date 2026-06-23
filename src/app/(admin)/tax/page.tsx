import { PageHeader } from "@/components/layout/page-header";
import { TaxManager } from "./tax-manager";

export const metadata = { title: "Tax | FleetFlow" };

export default function TaxPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Tax" subtitle="VAT & withholding-tax return preparation per filing period." />
      <TaxManager />
    </div>
  );
}
